import { Address, toNano } from "@ton/core";
import { Bundle } from "../wrappers/Bundle";
import { compile, NetworkProvider } from "@ton/blueprint";
import { promptBool, waitForTransaction } from "./ui-utils";

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();
    const ownerAddress = provider.sender().address;

    if (!Address.isAddress(ownerAddress)) {
        throw new Error("No owner address");
    }
    const bundle = provider.open(
        Bundle.createFromConfig(
            {
                owner: ownerAddress,
            },
            await compile("Bundle")
        )
    );

    await bundle.sendDeploy(provider.sender(), toNano("0.05"));

    await provider.waitForDeploy(bundle.address);

    const ans = await promptBool(
        "Want to transfer some NFTs to bundle? [y/n]:",
        ["y", "n"],
        ui
    );
    if (!ans) return;

    const collectibles = (
        args.length > 0
            ? args[0]
            : await ui.input("NFT addresses (separrated by comma)")
    )
        .split(",")
        .map((addr) => Address.parse(addr));

    ui.write("Transferring items to pack...");
    for (let addr of collectibles) {
        const item = provider.open(Bundle.createFromAddress(addr));
        await item.sendTransfer(
            provider.sender(),
            bundle.address,
            ownerAddress
        );
        if (await waitForTransaction(provider, bundle.address, 10)) {
            ui.write("Successfully transfered NFT " + addr.toString());
        } else ui.write("Failed to execute transfer NFT " + addr.toString());
    }
}
