import { Address, Cell } from "@ton/core";
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
            ? await bundle.getDomainIndex(itemAddressOrIndex)
            : itemAddressOrIndex;
    if (itemIndex < 0) {
        ui.write("Item is not in the bundle");
        return;
    }
    const itemsBefore = await bundle.getCollectibles();
    const itemBefore = itemsBefore.get(itemIndex);
    if (!itemBefore?.init) {
        ui.write("Item is not initialized");
        return;
    }
    const key = BigInt(await ui.input("Key to edit"));
    let valueString = await ui.input(
        "Value (b64 or hex encoded boc or Enter for delete)"
    );
    let value: Cell | undefined = undefined;
    if (valueString !== "") {
        try {
            value = Cell.fromBase64(valueString);
        } catch (e) {
            value = Cell.fromBoc(Buffer.from(valueString, "hex"))[0];
        }
    }

    await bundle.sendChangeRecordReq(provider.sender(), itemIndex, key, value);
    let changeSucc = await waitForTransaction(
        provider,
        itemBefore.itemAddress,
        10
    );

    const itemsAfter = await bundle.getCollectibles();
    const itemAfter = itemsAfter.get(itemIndex);
    if (!itemAfter || !itemAfter.itemAddress.equals(itemBefore.itemAddress)) {
        ui.write("Something went wrong. Item has disappeared.");
        return;
    }
    changeSucc =
        changeSucc && // also check for lastTouched increase
        itemAfter.lastTouched > itemBefore.lastTouched;

    if (!changeSucc) {
        ui.write("Failed to change a record");
        return;
    } else ui.write("Succesfully changed a record");
}
