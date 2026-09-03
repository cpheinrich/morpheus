export async function verifiedResearchLibraryBlob(identity, load) {
    const blob = await load();
    if (blob.size !== identity.bytes)
        throw new Error("The downloaded byte count did not match the catalog.");
    if (await sha256(blob) !== identity.sha256) {
        throw new Error("The downloaded SHA-256 did not match the catalog.");
    }
    return blob;
}
async function sha256(blob) {
    const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
//# sourceMappingURL=client.js.map