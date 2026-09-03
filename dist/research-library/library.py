#!/usr/bin/env python3
"""Build, publish, fetch, and verify immutable research-library bundles."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, replace
from pathlib import Path, PurePosixPath
from typing import Any

PROJECT_ID = os.environ.get("MORPHEUS_RESEARCH_LIBRARY_PROJECT", "")
BUCKET = os.environ.get("MORPHEUS_RESEARCH_LIBRARY_BUCKET", "")
OBJECT_PREFIX = os.environ.get(
    "MORPHEUS_RESEARCH_LIBRARY_OBJECT_PREFIX", "research-library/books"
).strip("/")
READER_FORMAT = "docling-html-embedded-v1"
REPOSITORY_ROOT = Path(
    os.environ.get("MORPHEUS_RESEARCH_LIBRARY_ROOT", Path.cwd())
).resolve()
CATALOG_DIR = REPOSITORY_ROOT / os.environ.get(
    "MORPHEUS_RESEARCH_LIBRARY_CATALOG_DIR", "hq/research/library/catalog"
)
LOCAL_LIBRARY_DIR = REPOSITORY_ROOT / "local/research-library"
DOCLING_EXPORTER = Path(__file__).with_name("docling_html.py")
ZIP_TIMESTAMP = (1980, 1, 1, 0, 0, 0)
SLUG_CHARS = frozenset("abcdefghijklmnopqrstuvwxyz0123456789-")


class LibraryError(ValueError):
    """The library contract or a bundle does not match its immutable identity."""


def validate_configuration() -> None:
    if not PROJECT_ID:
        raise LibraryError("MORPHEUS_RESEARCH_LIBRARY_PROJECT is required")
    if not BUCKET:
        raise LibraryError("MORPHEUS_RESEARCH_LIBRARY_BUCKET is required")
    if not OBJECT_PREFIX:
        raise LibraryError("MORPHEUS_RESEARCH_LIBRARY_OBJECT_PREFIX must not be empty")


@dataclass(frozen=True)
class BundleIdentity:
    bucket: str
    object: str
    sha256: str
    bytes: int
    files: int


@dataclass(frozen=True)
class ReaderIdentity:
    bucket: str
    object: str
    sha256: str
    bytes: int
    source_bundle_sha256: str
    format: str


@dataclass(frozen=True)
class BookManifest:
    path: Path
    slug: str
    title: str
    authors: tuple[str, ...]
    source_directory: str
    bundle: BundleIdentity
    reader: ReaderIdentity | None


@dataclass(frozen=True)
class PushResult:
    manifest: BookManifest
    local_path: Path
    uploaded: bool
    reader_uploaded: bool
    catalog_updated: bool


@dataclass(frozen=True)
class PullResult:
    manifest: BookManifest
    local_path: Path
    action: str


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _valid_slug(value: str) -> bool:
    return (
        bool(value)
        and value[0] != "-"
        and value[-1] != "-"
        and set(value) <= SLUG_CHARS
        and "--" not in value
    )


def load_manifest(path: Path) -> BookManifest:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise LibraryError(f"{path}: unreadable manifest") from error

    if not isinstance(value, dict) or value.get("schemaVersion") not in {
        "research-library-book-1",
        "research-library-book-2",
    }:
        raise LibraryError(
            f"{path}: schemaVersion must identify a research-library-book shape"
        )

    slug = value.get("slug")
    title = value.get("title")
    authors = value.get("authors")
    source_directory = value.get("sourceDirectory")
    bundle = value.get("bundle")
    reader = value.get("reader")
    if not isinstance(slug, str) or not _valid_slug(slug):
        raise LibraryError(f"{path}: invalid slug")
    if not isinstance(title, str) or not title.strip():
        raise LibraryError(f"{path}: title is required")
    if (
        not isinstance(authors, list)
        or not authors
        or any(not isinstance(author, str) or not author.strip() for author in authors)
    ):
        raise LibraryError(f"{path}: authors must be a non-empty string array")
    if (
        not isinstance(source_directory, str)
        or PurePosixPath(source_directory).name != source_directory
        or source_directory in {".", ".."}
    ):
        raise LibraryError(f"{path}: sourceDirectory must be one directory name")
    if not isinstance(bundle, dict):
        raise LibraryError(f"{path}: bundle is required")

    expected_fields: dict[str, type[Any]] = {
        "bucket": str,
        "object": str,
        "sha256": str,
        "bytes": int,
        "files": int,
    }
    for field, expected_type in expected_fields.items():
        field_value = bundle.get(field)
        valid_type = (
            type(field_value) is int
            if expected_type is int
            else isinstance(field_value, expected_type)
        )
        if not valid_type:
            raise LibraryError(f"{path}: bundle.{field} has the wrong type")

    digest = bundle["sha256"]
    expected_object = f"{OBJECT_PREFIX}/{slug}/{digest}.zip"
    if bundle["bucket"] != BUCKET:
        raise LibraryError(f"{path}: bundle.bucket must be {BUCKET}")
    if (
        not isinstance(digest, str)
        or len(digest) != 64
        or any(c not in "0123456789abcdef" for c in digest)
    ):
        raise LibraryError(f"{path}: bundle.sha256 must be a lowercase SHA-256")
    if bundle["object"] != expected_object:
        raise LibraryError(f"{path}: bundle.object must be {expected_object}")
    if bundle["bytes"] <= 0 or bundle["files"] <= 0:
        raise LibraryError(f"{path}: bundle bytes and files must be positive")
    if path.stem != slug:
        raise LibraryError(f"{path}: filename must match slug")

    reader_identity: ReaderIdentity | None = None
    if value["schemaVersion"] == "research-library-book-2":
        if not isinstance(reader, dict):
            raise LibraryError(
                f"{path}: reader is required for research-library-book-2"
            )
        reader_fields: dict[str, type[Any]] = {
            "bucket": str,
            "object": str,
            "sha256": str,
            "bytes": int,
            "sourceBundleSha256": str,
            "format": str,
        }
        for field, expected_type in reader_fields.items():
            field_value = reader.get(field)
            valid_type = (
                type(field_value) is int
                if expected_type is int
                else isinstance(field_value, expected_type)
            )
            if not valid_type:
                raise LibraryError(f"{path}: reader.{field} has the wrong type")
        reader_digest = reader["sha256"]
        if (
            len(reader_digest) != 64
            or any(c not in "0123456789abcdef" for c in reader_digest)
        ):
            raise LibraryError(f"{path}: reader.sha256 must be a lowercase SHA-256")
        expected_reader_object = f"{OBJECT_PREFIX}/{slug}/{reader_digest}.html"
        if reader["bucket"] != BUCKET:
            raise LibraryError(f"{path}: reader.bucket must be {BUCKET}")
        if reader["object"] != expected_reader_object:
            raise LibraryError(f"{path}: reader.object must be {expected_reader_object}")
        if reader["bytes"] <= 0:
            raise LibraryError(f"{path}: reader.bytes must be positive")
        if reader["sourceBundleSha256"] != digest:
            raise LibraryError(f"{path}: reader must bind the current bundle SHA-256")
        if reader["format"] != READER_FORMAT:
            raise LibraryError(f"{path}: reader.format must be {READER_FORMAT}")
        reader_identity = ReaderIdentity(
            bucket=reader["bucket"],
            object=reader["object"],
            sha256=reader_digest,
            bytes=reader["bytes"],
            source_bundle_sha256=reader["sourceBundleSha256"],
            format=reader["format"],
        )

    return BookManifest(
        path=path,
        slug=slug,
        title=title.strip(),
        authors=tuple(author.strip() for author in authors),
        source_directory=source_directory,
        bundle=BundleIdentity(
            bucket=bundle["bucket"],
            object=bundle["object"],
            sha256=digest,
            bytes=bundle["bytes"],
            files=bundle["files"],
        ),
        reader=reader_identity,
    )


def load_catalog(catalog_dir: Path = CATALOG_DIR) -> list[BookManifest]:
    manifests = [load_manifest(path) for path in sorted(catalog_dir.glob("*.json"))]
    if not manifests:
        raise LibraryError(f"{catalog_dir}: no book manifests")
    slugs = [manifest.slug for manifest in manifests]
    if len(slugs) != len(set(slugs)):
        raise LibraryError(f"{catalog_dir}: duplicate book slug")
    return manifests


def _source_files(source: Path) -> list[tuple[Path, PurePosixPath]]:
    if not source.is_dir():
        raise LibraryError(f"{source}: source is not a directory")

    files: list[tuple[Path, PurePosixPath]] = []
    for candidate in source.rglob("*"):
        relative = PurePosixPath(candidate.relative_to(source).as_posix())
        if candidate.is_symlink():
            raise LibraryError(f"{candidate}: symbolic links are not bundled")
        if any(part == ".DS_Store" or part.startswith(".staging-") for part in relative.parts):
            continue
        if candidate.is_file():
            files.append((candidate, relative))
        elif not candidate.is_dir():
            raise LibraryError(f"{candidate}: unsupported file type")
    files.sort(key=lambda item: item[1].as_posix())
    if not files:
        raise LibraryError(f"{source}: no bundle files")
    return files


def create_bundle(source: Path, output: Path) -> BundleIdentity:
    """Write one deterministic ZIP whose members are relative to the book root."""
    files = _source_files(source)
    output = output.resolve()
    if output.exists():
        raise LibraryError(f"{output}: output already exists")
    output.parent.mkdir(parents=True, exist_ok=True)

    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{output.name}.", dir=output.parent)
    os.close(descriptor)
    temporary = Path(temporary_name)
    try:
        with zipfile.ZipFile(temporary, "w", allowZip64=True) as archive:
            for source_file, relative in files:
                info = zipfile.ZipInfo(relative.as_posix(), date_time=ZIP_TIMESTAMP)
                info.create_system = 3
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = (stat.S_IFREG | 0o644) << 16
                with source_file.open("rb") as member:
                    archive.writestr(
                        info,
                        member.read(),
                        compress_type=zipfile.ZIP_DEFLATED,
                        compresslevel=9,
                    )
        os.replace(temporary, output)
    finally:
        temporary.unlink(missing_ok=True)

    return BundleIdentity(
        bucket=BUCKET,
        object="",
        sha256=sha256_file(output),
        bytes=output.stat().st_size,
        files=len(files),
    )


def _reader_identity(
    manifest: BookManifest,
    bundle: BundleIdentity,
    reader: Path,
) -> ReaderIdentity:
    digest = sha256_file(reader)
    return ReaderIdentity(
        bucket=BUCKET,
        object=f"{OBJECT_PREFIX}/{manifest.slug}/{digest}.html",
        sha256=digest,
        bytes=reader.stat().st_size,
        source_bundle_sha256=bundle.sha256,
        format=READER_FORMAT,
    )


def _manifest_for_identities(
    manifest: BookManifest,
    identity: BundleIdentity,
    reader: Path,
) -> BookManifest:
    bundle = BundleIdentity(
        bucket=BUCKET,
        object=f"{OBJECT_PREFIX}/{manifest.slug}/{identity.sha256}.zip",
        sha256=identity.sha256,
        bytes=identity.bytes,
        files=identity.files,
    )
    return replace(
        manifest,
        bundle=bundle,
        reader=_reader_identity(manifest, bundle, reader),
    )


def _write_manifest_artifacts(manifest: BookManifest) -> BookManifest:
    """Replace derived pointers only after both objects are available remotely."""
    if manifest.reader is None:
        raise LibraryError(f"{manifest.slug}: reader identity is unavailable")
    try:
        value = json.loads(manifest.path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise LibraryError(f"{manifest.path}: unreadable manifest") from error

    value["schemaVersion"] = "research-library-book-2"
    value["bundle"] = {
        "bucket": manifest.bundle.bucket,
        "object": manifest.bundle.object,
        "sha256": manifest.bundle.sha256,
        "bytes": manifest.bundle.bytes,
        "files": manifest.bundle.files,
    }
    value["reader"] = {
        "bucket": manifest.reader.bucket,
        "object": manifest.reader.object,
        "sha256": manifest.reader.sha256,
        "bytes": manifest.reader.bytes,
        "sourceBundleSha256": manifest.reader.source_bundle_sha256,
        "format": manifest.reader.format,
    }
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{manifest.path.name}.",
        dir=manifest.path.parent,
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as target:
            target.write(json.dumps(value, indent=2))
            target.write("\n")
        os.chmod(temporary, stat.S_IMODE(manifest.path.stat().st_mode))
        os.replace(temporary, manifest.path)
    finally:
        temporary.unlink(missing_ok=True)
    return load_manifest(manifest.path)


def _resolve_docling_python() -> Path:
    configured = os.environ.get("DOCLING_PYTHON")
    if configured:
        candidate = Path(configured).expanduser()
        if candidate.is_file():
            return candidate
        raise LibraryError(f"DOCLING_PYTHON is not an executable file: {candidate}")

    tool_home = Path(
        os.environ.get(
            "BABEL_TOOL_HOME",
            Path.home() / ".local/share/babel/tools",
        )
    ).expanduser()
    managed = tool_home / "uv-tools/docling/bin/python"
    if managed.is_file():
        return managed

    docling = shutil.which("docling")
    if docling:
        sibling = Path(docling).resolve().parent / "python"
        if sibling.is_file():
            return sibling

    try:
        subprocess.run(
            [sys.executable, "-c", "import docling_core"],
            check=True,
            capture_output=True,
        )
    except subprocess.CalledProcessError as error:
        raise LibraryError(
            "Docling is unavailable; install Babel's managed Docling tool or set DOCLING_PYTHON"
        ) from error
    return Path(sys.executable)


def export_reader(source_directory: Path, output: Path) -> None:
    """Generate fresh self-contained HTML from the canonical Docling JSON."""
    source = source_directory / "docling/source.json"
    if not source.is_file():
        raise LibraryError(f"{source}: canonical Docling JSON is unavailable")
    try:
        subprocess.run(
            [str(_resolve_docling_python()), str(DOCLING_EXPORTER), str(source), str(output)],
            check=True,
        )
    except subprocess.CalledProcessError as error:
        raise LibraryError(f"{source_directory}: Docling HTML export failed") from error
    if not output.is_file() or output.stat().st_size <= 0:
        raise LibraryError(f"{output}: Docling HTML export produced no bytes")


def local_book_directory(
    manifest: BookManifest,
    local_root: Path = LOCAL_LIBRARY_DIR,
) -> Path:
    return local_root / manifest.source_directory


def local_book_matches(manifest: BookManifest, local_path: Path) -> bool:
    if not local_path.is_dir():
        return False
    with tempfile.TemporaryDirectory(prefix="morpheus-library-local-check-") as temporary:
        bundle = Path(temporary) / f"{manifest.slug}.zip"
        identity = create_bundle(local_path, bundle)
        return (
            identity.sha256 == manifest.bundle.sha256
            and identity.bytes == manifest.bundle.bytes
            and identity.files == manifest.bundle.files
        )


def verify_bundle(manifest: BookManifest, bundle: Path) -> None:
    if not bundle.is_file():
        raise LibraryError(f"{bundle}: bundle is unavailable")
    if bundle.stat().st_size != manifest.bundle.bytes:
        raise LibraryError(f"{bundle}: byte size does not match {manifest.slug}")
    if sha256_file(bundle) != manifest.bundle.sha256:
        raise LibraryError(f"{bundle}: SHA-256 does not match {manifest.slug}")

    seen: set[str] = set()
    file_count = 0
    try:
        with zipfile.ZipFile(bundle) as archive:
            for member in archive.infolist():
                _validate_member(member, seen)
                if not member.is_dir():
                    file_count += 1
            bad_member = archive.testzip()
    except zipfile.BadZipFile as error:
        raise LibraryError(f"{bundle}: invalid ZIP") from error
    if bad_member is not None:
        raise LibraryError(f"{bundle}: corrupt member {bad_member}")
    if file_count != manifest.bundle.files:
        raise LibraryError(f"{bundle}: file count does not match {manifest.slug}")


def _validate_member(member: zipfile.ZipInfo, seen: set[str]) -> None:
    path = PurePosixPath(member.filename)
    if (
        path.is_absolute()
        or not path.parts
        or any(part in {"", ".", ".."} for part in path.parts)
        or member.filename in seen
    ):
        raise LibraryError(f"unsafe ZIP member: {member.filename}")
    mode = member.external_attr >> 16
    if stat.S_ISLNK(mode):
        raise LibraryError(f"symbolic link in ZIP: {member.filename}")
    seen.add(member.filename)


def extract_bundle(manifest: BookManifest, bundle: Path, output: Path) -> None:
    verify_bundle(manifest, bundle)
    if output.exists():
        raise LibraryError(f"{output}: destination already exists")
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{manifest.slug}.staging-", dir=output.parent))
    try:
        seen: set[str] = set()
        with zipfile.ZipFile(bundle) as archive:
            for member in archive.infolist():
                _validate_member(member, seen)
                destination = staging.joinpath(*PurePosixPath(member.filename).parts)
                if member.is_dir():
                    destination.mkdir(parents=True, exist_ok=True)
                    continue
                destination.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(member) as source, destination.open("wb") as target:
                    shutil.copyfileobj(source, target)
        os.replace(staging, output)
    finally:
        shutil.rmtree(staging, ignore_errors=True)


def _run_gcloud(arguments: Iterable[str], gcloud: str) -> None:
    subprocess.run([gcloud, *arguments], check=True)


def _run_gcloud_json(arguments: Iterable[str], gcloud: str) -> Any:
    output = subprocess.run(
        [gcloud, *arguments, "--format=json"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    return json.loads(output)


def _remote_metadata_or_none(bucket: str, object_name: str, gcloud: str) -> Any | None:
    try:
        return _run_gcloud_json(
            [
                "storage",
                "objects",
                "describe",
                f"gs://{bucket}/{object_name}",
                "--project",
                PROJECT_ID,
            ],
            gcloud,
        )
    except subprocess.CalledProcessError as error:
        message = "\n".join(
            part for part in (error.stdout, error.stderr) if isinstance(part, str)
        ).lower()
        missing_markers = (
            "not found",
            "no urls matched",
            "matched no objects",
            "status=[404]",
            "status code 404",
        )
        if any(marker in message for marker in missing_markers):
            return None
        raise


def remote_metadata_or_none(manifest: BookManifest, gcloud: str = "gcloud") -> Any | None:
    return _remote_metadata_or_none(
        manifest.bundle.bucket,
        manifest.bundle.object,
        gcloud,
    )


def reader_metadata_or_none(manifest: BookManifest, gcloud: str = "gcloud") -> Any | None:
    if manifest.reader is None:
        raise LibraryError(f"{manifest.slug}: reader identity is unavailable")
    return _remote_metadata_or_none(
        manifest.reader.bucket,
        manifest.reader.object,
        gcloud,
    )


def download_bundle(manifest: BookManifest, destination: Path, gcloud: str = "gcloud") -> None:
    _run_gcloud(
        [
            "storage",
            "cp",
            f"gs://{manifest.bundle.bucket}/{manifest.bundle.object}",
            str(destination),
            "--project",
            PROJECT_ID,
            "--quiet",
        ],
        gcloud,
    )


def download_reader(manifest: BookManifest, destination: Path, gcloud: str = "gcloud") -> None:
    if manifest.reader is None:
        raise LibraryError(f"{manifest.slug}: reader identity is unavailable")
    _run_gcloud(
        [
            "storage",
            "cp",
            f"gs://{manifest.reader.bucket}/{manifest.reader.object}",
            str(destination),
            "--project",
            PROJECT_ID,
            "--quiet",
        ],
        gcloud,
    )


def upload_bundle(manifest: BookManifest, bundle: Path, gcloud: str = "gcloud") -> None:
    verify_bundle(manifest, bundle)
    _run_gcloud(
        [
            "storage",
            "cp",
            str(bundle),
            f"gs://{manifest.bundle.bucket}/{manifest.bundle.object}",
            "--project",
            PROJECT_ID,
            "--if-generation-match=0",
            "--content-type=application/zip",
            f"--content-disposition=attachment; filename={manifest.slug}.zip",
            "--cache-control=private,max-age=0,no-store",
            f"--custom-metadata=sha256={manifest.bundle.sha256}",
            "--quiet",
        ],
        gcloud,
    )


def verify_reader(manifest: BookManifest, reader: Path) -> None:
    if manifest.reader is None:
        raise LibraryError(f"{manifest.slug}: reader identity is unavailable")
    if not reader.is_file():
        raise LibraryError(f"{reader}: reader is unavailable")
    if reader.stat().st_size != manifest.reader.bytes:
        raise LibraryError(f"{reader}: byte size does not match {manifest.slug} reader")
    if sha256_file(reader) != manifest.reader.sha256:
        raise LibraryError(f"{reader}: SHA-256 does not match {manifest.slug} reader")


def upload_reader(manifest: BookManifest, reader: Path, gcloud: str = "gcloud") -> None:
    if manifest.reader is None:
        raise LibraryError(f"{manifest.slug}: reader identity is unavailable")
    verify_reader(manifest, reader)
    _run_gcloud(
        [
            "storage",
            "cp",
            str(reader),
            f"gs://{manifest.reader.bucket}/{manifest.reader.object}",
            "--project",
            PROJECT_ID,
            "--if-generation-match=0",
            "--content-type=text/html; charset=utf-8",
            f"--content-disposition=inline; filename={manifest.slug}.html",
            "--cache-control=private,max-age=0,no-store",
            (
                "--custom-metadata="
                f"sha256={manifest.reader.sha256},"
                f"sourceBundleSha256={manifest.reader.source_bundle_sha256},"
                f"format={manifest.reader.format}"
            ),
            "--quiet",
        ],
        gcloud,
    )


def push_book(
    manifest: BookManifest,
    local_root: Path = LOCAL_LIBRARY_DIR,
    gcloud: str = "gcloud",
) -> PushResult:
    local_path = local_book_directory(manifest, local_root)
    with tempfile.TemporaryDirectory(prefix="morpheus-library-push-") as temporary:
        bundle = Path(temporary) / f"{manifest.slug}.zip"
        reader = Path(temporary) / f"{manifest.slug}.html"
        identity = create_bundle(local_path, bundle)
        # Deliberately regenerate on every push. The upload boundary is where we
        # promise that every catalogued bundle has a reader derived from its
        # canonical Docling JSON, including books converted before HTML existed.
        export_reader(local_path, reader)
        candidate = _manifest_for_identities(manifest, identity, reader)
        metadata = remote_metadata_or_none(candidate, gcloud)
        uploaded = metadata is None
        if uploaded:
            upload_bundle(candidate, bundle, gcloud)
            metadata = remote_metadata_or_none(candidate, gcloud)
            if metadata is None:
                raise LibraryError(
                    f"{candidate.slug}: uploaded object is not visible remotely"
                )
            verify_remote_metadata(candidate, metadata)
        else:
            verify_remote_metadata(candidate, metadata)

        reader_metadata = reader_metadata_or_none(candidate, gcloud)
        reader_uploaded = reader_metadata is None
        if reader_uploaded:
            upload_reader(candidate, reader, gcloud)
            reader_metadata = reader_metadata_or_none(candidate, gcloud)
            if reader_metadata is None:
                raise LibraryError(
                    f"{candidate.slug}: uploaded reader is not visible remotely"
                )
            verify_remote_reader_metadata(candidate, reader_metadata)
        else:
            verify_remote_reader_metadata(candidate, reader_metadata)

    catalog_updated = (
        candidate.bundle != manifest.bundle
        or candidate.reader != manifest.reader
    )
    if catalog_updated:
        candidate = _write_manifest_artifacts(candidate)
    return PushResult(
        manifest=candidate,
        local_path=local_path,
        uploaded=uploaded,
        reader_uploaded=reader_uploaded,
        catalog_updated=catalog_updated,
    )


def fetch_book(
    manifest: BookManifest,
    output_root: Path = LOCAL_LIBRARY_DIR,
    gcloud: str = "gcloud",
) -> Path:
    with tempfile.TemporaryDirectory(prefix="lakina-library-download-") as temporary:
        bundle = Path(temporary) / f"{manifest.slug}.zip"
        download_bundle(manifest, bundle, gcloud)
        output = local_book_directory(manifest, output_root)
        extract_bundle(manifest, bundle, output)
        return output


def _replace_local_book(manifest: BookManifest, bundle: Path, output: Path) -> None:
    workspace = Path(
        tempfile.mkdtemp(prefix=f".{manifest.slug}.pull-", dir=output.parent)
    )
    replacement = workspace / "replacement"
    previous = workspace / "previous"
    previous_holds_local = False
    try:
        extract_bundle(manifest, bundle, replacement)
        os.replace(output, previous)
        previous_holds_local = True
        try:
            os.replace(replacement, output)
            previous_holds_local = False
        except OSError:
            os.replace(previous, output)
            previous_holds_local = False
            raise
    finally:
        # If restoration itself fails, preserve the workspace containing the old
        # local copy rather than turning a failed pull into data loss.
        if not previous_holds_local:
            shutil.rmtree(workspace, ignore_errors=True)


def pull_book(
    manifest: BookManifest,
    local_root: Path = LOCAL_LIBRARY_DIR,
    gcloud: str = "gcloud",
    *,
    replace_local: bool = False,
) -> PullResult:
    output = local_book_directory(manifest, local_root)
    if output.exists():
        if local_book_matches(manifest, output):
            return PullResult(manifest=manifest, local_path=output, action="current")
        if not replace_local:
            raise LibraryError(
                f"{output}: local book differs from {manifest.slug}; "
                "rerun pull with --replace to restore the catalogued bundle"
            )

    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="lakina-library-pull-") as temporary:
        bundle = Path(temporary) / f"{manifest.slug}.zip"
        download_bundle(manifest, bundle, gcloud)
        if output.exists():
            _replace_local_book(manifest, bundle, output)
            action = "replaced"
        else:
            extract_bundle(manifest, bundle, output)
            action = "downloaded"
    return PullResult(manifest=manifest, local_path=output, action=action)


def verify_remote(manifest: BookManifest, gcloud: str = "gcloud") -> None:
    metadata = _run_gcloud_json(
        [
            "storage",
            "objects",
            "describe",
            f"gs://{manifest.bundle.bucket}/{manifest.bundle.object}",
            "--project",
            PROJECT_ID,
        ],
        gcloud,
    )
    verify_remote_metadata(manifest, metadata)
    reader_metadata = reader_metadata_or_none(manifest, gcloud)
    if reader_metadata is None:
        raise LibraryError(f"{manifest.slug}: remote reader is unavailable")
    verify_remote_reader_metadata(manifest, reader_metadata)
    with tempfile.TemporaryDirectory(prefix="lakina-library-verify-") as temporary:
        bundle = Path(temporary) / f"{manifest.slug}.zip"
        reader = Path(temporary) / f"{manifest.slug}.html"
        download_bundle(manifest, bundle, gcloud)
        verify_bundle(manifest, bundle)
        download_reader(manifest, reader, gcloud)
        verify_reader(manifest, reader)


def verify_remote_metadata(manifest: BookManifest, metadata: Any) -> None:
    if not isinstance(metadata, Mapping):
        raise LibraryError(f"{manifest.slug}: remote metadata is unavailable")
    expected = {
        "bucket": manifest.bundle.bucket,
        "name": manifest.bundle.object,
        "size": manifest.bundle.bytes,
        "content_type": "application/zip",
        "content_disposition": f"attachment; filename={manifest.slug}.zip",
        "cache_control": "private,max-age=0,no-store",
        "custom_fields": {"sha256": manifest.bundle.sha256},
    }
    mismatches = [field for field, value in expected.items() if metadata.get(field) != value]
    if mismatches:
        raise LibraryError(
            f"{manifest.slug}: remote metadata mismatch: {', '.join(sorted(mismatches))}"
        )


def verify_remote_reader_metadata(manifest: BookManifest, metadata: Any) -> None:
    if manifest.reader is None:
        raise LibraryError(f"{manifest.slug}: reader identity is unavailable")
    if not isinstance(metadata, Mapping):
        raise LibraryError(f"{manifest.slug}: remote reader metadata is unavailable")
    expected = {
        "bucket": manifest.reader.bucket,
        "name": manifest.reader.object,
        "size": manifest.reader.bytes,
        "content_type": "text/html; charset=utf-8",
        "content_disposition": f"inline; filename={manifest.slug}.html",
        "cache_control": "private,max-age=0,no-store",
        "custom_fields": {
            "sha256": manifest.reader.sha256,
            "sourceBundleSha256": manifest.reader.source_bundle_sha256,
            "format": manifest.reader.format,
        },
    }
    mismatches = [field for field, value in expected.items() if metadata.get(field) != value]
    if mismatches:
        raise LibraryError(
            f"{manifest.slug}: remote reader metadata mismatch: "
            + ", ".join(sorted(mismatches))
        )


def manifest_for_slug(slug: str, catalog_dir: Path = CATALOG_DIR) -> BookManifest:
    if not _valid_slug(slug):
        raise LibraryError(f"invalid slug: {slug}")
    return load_manifest(catalog_dir / f"{slug}.json")


def select_manifests(
    slugs: Iterable[str],
    catalog_dir: Path = CATALOG_DIR,
) -> list[BookManifest]:
    requested = list(slugs)
    if not requested:
        return load_catalog(catalog_dir)
    if len(requested) != len(set(requested)):
        raise LibraryError("book slugs must not be repeated")
    return [manifest_for_slug(slug, catalog_dir) for slug in requested]


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gcloud", default="gcloud", help="gcloud executable")
    subparsers = parser.add_subparsers(dest="command", required=True)

    bundle = subparsers.add_parser("bundle", help="create a deterministic ZIP")
    bundle.add_argument("source", type=Path)
    bundle.add_argument("output", type=Path)

    upload = subparsers.add_parser("upload", help="create an immutable remote object")
    upload.add_argument("manifest", type=Path)
    upload.add_argument("bundle", type=Path)

    fetch = subparsers.add_parser("fetch", help="download, verify, and extract one book")
    fetch.add_argument("slug")
    fetch.add_argument("--output-root", type=Path, default=LOCAL_LIBRARY_DIR)

    push = subparsers.add_parser(
        "push",
        help="synchronize local books to immutable remote objects",
    )
    push.add_argument("slugs", nargs="*", metavar="SLUG")
    push.add_argument("--local-root", type=Path, default=LOCAL_LIBRARY_DIR)

    pull = subparsers.add_parser(
        "pull",
        help="synchronize catalogued remote books into the local library",
    )
    pull.add_argument("slugs", nargs="*", metavar="SLUG")
    pull.add_argument("--local-root", type=Path, default=LOCAL_LIBRARY_DIR)
    pull.add_argument(
        "--replace",
        action="store_true",
        help="replace a divergent local book after the remote bundle verifies",
    )

    verify = subparsers.add_parser("verify", help="validate the catalog and optional remote bytes")
    verify.add_argument("slugs", nargs="*")
    verify.add_argument("--remote", action="store_true")

    verify_local = subparsers.add_parser(
        "verify-bundle",
        help="verify a local ZIP against a manifest",
    )
    verify_local.add_argument("manifest", type=Path)
    verify_local.add_argument("bundle", type=Path)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        validate_configuration()
        if args.command == "bundle":
            identity = create_bundle(args.source, args.output)
            print(
                json.dumps(
                    {
                        "sha256": identity.sha256,
                        "bytes": identity.bytes,
                        "files": identity.files,
                    }
                )
            )
        elif args.command == "upload":
            manifest = load_manifest(args.manifest)
            upload_bundle(manifest, args.bundle, args.gcloud)
            print(f"uploaded {manifest.slug} -> gs://{manifest.bundle.bucket}/{manifest.bundle.object}")
        elif args.command == "fetch":
            manifest = manifest_for_slug(args.slug)
            output = fetch_book(manifest, args.output_root, args.gcloud)
            print(output)
        elif args.command == "push":
            selected = select_manifests(args.slugs)
            missing = [
                str(local_book_directory(manifest, args.local_root))
                for manifest in selected
                if not local_book_directory(manifest, args.local_root).is_dir()
            ]
            if missing:
                raise LibraryError(
                    "local book directories are unavailable: " + ", ".join(missing)
                )
            for manifest in selected:
                result = push_book(
                    manifest,
                    local_root=args.local_root,
                    gcloud=args.gcloud,
                )
                action = (
                    "uploaded"
                    if result.uploaded or result.reader_uploaded
                    else "linked"
                    if result.catalog_updated
                    else "current"
                )
                print(f"{action} {manifest.slug}: {result.local_path}")
            print(f"synchronized {len(selected)} book(s) local -> remote")
        elif args.command == "pull":
            selected = select_manifests(args.slugs)
            for manifest in selected:
                result = pull_book(
                    manifest,
                    local_root=args.local_root,
                    gcloud=args.gcloud,
                    replace_local=args.replace,
                )
                print(f"{result.action} {manifest.slug}: {result.local_path}")
            print(f"synchronized {len(selected)} book(s) remote -> local")
        elif args.command == "verify":
            selected = select_manifests(args.slugs)
            if args.remote:
                for manifest in selected:
                    verify_remote(manifest, args.gcloud)
            remote_suffix = " and remote bundle/reader object(s)" if args.remote else ""
            print(f"verified {len(selected)} book manifest(s){remote_suffix}")
        elif args.command == "verify-bundle":
            manifest = load_manifest(args.manifest)
            verify_bundle(manifest, args.bundle)
            print(f"verified {manifest.slug}")
        return 0
    except (LibraryError, OSError, subprocess.CalledProcessError) as error:
        raise SystemExit(f"research library: {error}") from error


if __name__ == "__main__":
    raise SystemExit(main())
