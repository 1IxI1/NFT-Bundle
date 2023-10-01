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

    const bundle = provider.open(Bundle.createFromAddress(bundleAddress));

    const items = await bundle.getCollectibles();
    if (items.size == 0) {
        ui.write("The bundle is empty");
        return;
    }

    await bundle.sendUnpackAll(provider.sender());
    let unpackSucc = await waitForTransaction(provider, bundleAddress, 10);
    const { last } = await provider.api().getLastBlock();
    const { account } = await provider
        .api()
        .getAccount(last.seqno, bundleAddress);
    unpackSucc = unpackSucc && account.balance.coins == "0";
    if (!unpackSucc) {
        ui.write("Failed to execute unpack transaction");
        return;
    }
    ui.write("Succesfully unpacked all items");
}
