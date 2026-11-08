function descriptor(objectName, row) {
  return {
    objectName, name: objectName.split("/").at(-1), type: row.contentType,
    generation: String(row.generation), size: Number(row.size), sha256: row.metadata?.sha256,
  };
}

export function fleetObjects(bucket, credential) {
  async function metadata(objectName) {
    try {
      const [row] = await bucket.file(objectName).getMetadata();
      return descriptor(objectName, row);
    } catch (error) {
      if (Number(error.code) !== 404) throw error;
      return null;
    }
  }
  return {
    metadata,
    async put(file, bytes) {
      try {
        await bucket.file(file.objectName).save(bytes, {
          resumable: false,
          metadata: { contentType: file.type, metadata: { sha256: file.sha256 } },
          preconditionOpts: { ifGenerationMatch: 0 },
        });
      } catch (error) {
        if (Number(error.code) !== 412) throw error;
      }
      const existing = await metadata(file.objectName);
      if (existing?.sha256 !== file.sha256 || existing.size !== file.size || existing.type !== file.type)
        throw Object.assign(new Error("Factory artifact already exists with different content"), { status: 409 });
      return existing;
    },
    async download({ objectName, generation, size }) {
      const url = new URL(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(objectName)}`);
      // Preserve the decimal generation exactly. Storage's SDK file constructor
      // coerces generation to a JS Number.
      url.search = new URLSearchParams({ alt: "media", generation }).toString();
      const { access_token } = await credential.getAccessToken();
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${access_token}` }, redirect: "error", signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok || Number(response.headers.get("content-length")) !== size)
        throw new Error("Factory artifact is unavailable at its recorded generation");
      return Buffer.from(await response.arrayBuffer());
    },
  };
}
