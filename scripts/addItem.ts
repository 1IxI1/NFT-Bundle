import { Address } from "@ton/core";
import { Bundle } from "../wrappers/Bundle";
import { NetworkProvider } from "@ton/blueprint";
import { DNSItemContract } from "../wrappers/DNSItem";
import { promptBool, waitForTransaction } from "./ui-utils";

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

    const itemIndex = await bundle.getCollectibleIndex(itemAddress);
    if (itemIndex !== -1) {
        throw new Error("Item already exists");
    }

    await bundle.sendAddItem(provider.sender(), itemAddress);
    const addSucc = await waitForTransaction(provider, bundleAddress, 10);
    if (!addSucc) {
        ui.write("Failed to execute add item transaction");
        return;
    }

    const newItemIndex = await bundle.getCollectibleIndex(itemAddress);
    if (newItemIndex === -1) {
        throw new Error("Failed to add item");
    }

    // transfer item to pack
    const cont = await promptBool(
        "Transfer added item to pack? (yes/no)",
        ["yes", "no"],
        ui
    );
    if (!cont) return;
    const dnsItem = provider.open(
        DNSItemContract.createFromAddress(itemAddress)
    );
    await dnsItem.sendTransfer(provider.sender(), bundle.address, ownerAddress);
    const trasferSucc = await waitForTransaction(provider, bundleAddress, 10);
    if (!trasferSucc) {
        ui.write("Failed to execute transfer item transaction");
        return;
    }
    const items = await bundle.getCollectibles();
    if (items.get(newItemIndex)?.init)
        ui.write(
            "Succesfully transfered " + itemAddress.toString() + " to pack."
        );
    else ui.write("Failed to transfer item to pack.");
}
