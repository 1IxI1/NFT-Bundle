import { Address } from "@ton/core";
import { Bundle } from "../wrappers/Bundle";
import { NetworkProvider } from "@ton/blueprint";
import { waitForTransaction } from "./ui-utils";

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();
    const ownerAddress = provider.sender().address;

    if (!Address.isAddress(ownerAddress)) {
        throw new Error("No owner address");
    }

    const bundleAddress = Address.parse(
        args.length > 0 ? args[0] : await ui.input("Bundle address")
    );
    const itemAddress = Address.parse(
        args.length > 1 ? args[1] : await ui.input("Item address")
    );

    const bundle = provider.open(Bundle.createFromAddress(bundleAddress));

    const itemIndex = await bundle.getDomainIndex(itemAddress);
    if (itemIndex === -1) {
        throw new Error("Item is not in the bundle");
    }

    await bundle.sendUnpack(provider.sender(), itemIndex);
    const unpackSucc = await waitForTransaction(provider, bundleAddress, 10);
    if (!unpackSucc) {
        ui.write("Failed to execute unpack transaction");
        return;
    }

    const newItemIndex = await bundle.getDomainIndex(itemAddress);
    if (newItemIndex !== -1) ui.write("Failed to unpack the item.");
    else ui.write("Succesfully unpacked " + itemAddress.toString());
}

