import { formatMorpheusInstallStatus, installCurrentMorpheus, morpheusInstallStatus, updateMorpheus, } from "../self.js";
export async function check(offline) {
    const status = await morpheusInstallStatus({ offline });
    console.log(formatMorpheusInstallStatus(status));
    return status.fresh === true ? 0 : 1;
}
export async function install(source) {
    try {
        const result = await installCurrentMorpheus(source);
        console.log(`Installed Morpheus ${result.commit.slice(0, 7)} as a standalone global package.\n` +
            `Source checkout left unchanged: ${source}`);
        return 0;
    }
    catch (error) {
        console.error(`Could not install Morpheus: ${error.message}`);
        return 1;
    }
}
export async function update() {
    try {
        const result = await updateMorpheus();
        console.log(`Updated Morpheus to current main ${result.commit.slice(0, 7)}.\n` +
            "The disposable checkout was removed; no working repository was changed.");
        return 0;
    }
    catch (error) {
        console.error(`Could not update Morpheus: ${error.message}`);
        return 1;
    }
}
//# sourceMappingURL=self.js.map