import { Address } from "@ton/core";
import { Bundle } from "../wrappers/Bundle";
import { NetworkProvider } from "@ton/blueprint";
import { promptAddressOrIndex, waitForTransaction } from "./ui-utils";

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();
    const ownerAddress = provider.sender().address;

    if (!Address.isAddress(ownerAddress)) {
        throw new Error("No owner address");
    }

    const bundleAddress = Address.parse(
        args.length > 0 ? args[0] : await ui.input("Bundle address")
    );
    const itemAddressOrIndex = await promptAddressOrIndex(ui);

    const bundle = provider.open(Bundle.createFromAddress(bundleAddress));

    const itemIndex =
        itemAddressOrIndex instanceof Address
            ? await bundle.getCollectibleIndex(itemAddressOrIndex)
            : itemAddressOrIndex;
    if (itemIndex < 0) {
        throw new Error("Item is not in the bundle");
    }

    const itemsBefore = await bundle.getCollectibles();
    await bundle.sendUnpack(provider.sender(), itemIndex);
    let unpackSucc = await waitForTransaction(provider, bundleAddress, 10);
    const itemsAfter = await bundle.getCollectibles();
    unpackSucc = unpackSucc && itemsBefore.size !== itemsAfter.size;
    if (!unpackSucc) {
        ui.write("Failed to execute unpack transaction");
        return;
    } else ui.write("Succesfully unpacked");
}
