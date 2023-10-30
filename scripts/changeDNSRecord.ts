import { Address, Cell, internal, toNano } from "@ton/core";
import { Bundle, ScheduledMessage } from "../wrappers/Bundle";
import { NetworkProvider } from "@ton/blueprint";
import { waitForTransaction } from "./ui-utils";
import { DNSItemContract } from "../wrappers/DNSItem";

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();
    const senderAddress = provider.sender().address;

    if (!Address.isAddress(senderAddress)) {
        throw new Error("No sender address");
    }

    const bundleAddress = Address.parse(
        args.length > 0 ? args[0] : await ui.input("Bundle address")
    );

    const bundle = provider.open(Bundle.createFromAddress(bundleAddress));

    const dnsItemAddress = Address.parse(
        args.length > 1 ? args[1] : await ui.input("DNS item address")
    );
    const item = provider.open(
        DNSItemContract.createFromAddress(dnsItemAddress)
    );
    const owner = await item.getOwnerAddress();
    if (!owner.equals(bundleAddress)) {
        ui.write("Bundle is not the item owner.");
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

    const body = DNSItemContract.createEditRecordBody(key, value);
    let msgs: ScheduledMessage[] = [
        {
            at: 0,
            message: internal({
                to: dnsItemAddress,
                value: toNano("0.1"),
                body,
            }),
        },
    ];
    await bundle.sendMessages(provider.sender(), msgs);

    let changeSucc = await waitForTransaction(provider, dnsItemAddress, 10);

    if (!changeSucc) {
        ui.write(
            "Failed to change DNS Record. Can not find message on domain side."
        );
        return;
    } else
        ui.write(
            "Change record request was successfully delivered to the domain."
        );
}
