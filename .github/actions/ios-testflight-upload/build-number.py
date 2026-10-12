"""Reserve automatic build numbers while the caller holds the account signing lock."""
import hashlib
import json
import os
from pathlib import Path
import pwd
import sys
import tempfile


def reserve(directory, app, version, proposed, automatic):
    if proposed < 1:
        raise ValueError("Build number must be positive")
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    key = hashlib.sha256(json.dumps([app, version]).encode()).hexdigest()
    target = directory / (key + ".json")
    previous = json.loads(target.read_text()) if target.exists() else 0
    if type(previous) is not int or previous < 0:
        raise ValueError("Invalid existing build reservation; refusing to reset it")
    number = max(proposed, previous + 1) if automatic else proposed
    # Explicit caller numbers retain their existing meaning, but still raise the
    # floor for subsequent automatic runs. Failed runs may leave intentional gaps.
    fd, temporary = tempfile.mkstemp(dir=directory)
    try:
        with os.fdopen(fd, "w") as stream:
            json.dump(max(number, previous), stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return number


if __name__ == "__main__":
    try:
        # Match signing-lock.py's UID-owned home, independent of runner HOME.
        directory = Path(pwd.getpwuid(os.getuid()).pw_dir) / "Library/Caches/morpheus/testflight-build-numbers"
        print(reserve(directory, os.environ["ASC_APP_ID"], os.environ["MARKETING_VERSION"],
                      int(sys.argv[1]), sys.argv[2] == "true"))
    except (OSError, ValueError, KeyError) as error:
        print("Could not reserve TestFlight build number: " + str(error), file=sys.stderr)
        sys.exit(1)
