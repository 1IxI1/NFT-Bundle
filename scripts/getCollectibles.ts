import { Address } from "@ton/core";
import { Bundle } from "../wrappers/Bundle";
import { NetworkProvider } from "@ton/blueprint";

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
    console.table(
        items.values().map((item) => {
            return {
                address: item.itemAddress.toString(),
                inited: item.init,
                lastTouched: item.lastTouched.toString(),
            };
        })
    );
}
