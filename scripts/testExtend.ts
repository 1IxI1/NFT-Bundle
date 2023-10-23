import { Address, Cell, fromNano, toNano } from "@ton/core";
import { NetworkProvider } from "@ton/blueprint";
import { waitForTransaction } from "./ui-utils";
import { DNSItemContract } from "../wrappers/DNSItem";

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    const itemAddress = Address.parse(
        args.length > 0 ? args[0] : await ui.input("Item address")
    );
    const item = provider.open(DNSItemContract.createFromAddress(itemAddress));

    await item.sendDeploy(provider.sender(), toNano("0.005"));
    let touchSucc = await waitForTransaction(provider, itemAddress, 10);
    if (!touchSucc) {
        ui.write("Failed to touch");
        return;
    } else ui.write("Succesfully touched the item");
}
