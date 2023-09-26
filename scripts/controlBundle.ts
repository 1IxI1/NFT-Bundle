import {
    Address,
    beginCell,
    Cell,
    fromNano,
    OpenedContract,
    toNano,
} from "@ton/core";
import { compile, sleep, NetworkProvider, UIProvider } from "@ton/blueprint";
import { Bundle } from "../wrappers/Bundle";
import {
    promptBool,
    promptAmount,
    promptAddress,
    displayContentCell,
    waitForTransaction,
} from "./ui-utils";

let bundleContract: OpenedContract<Bundle>;

const adminActions = [
    "Add item",
    "Transfer",
    "Topup",
    "Unpack one",
    "Unpack all",
    "Change DNS Record",
];
const userActions = ["Get data", "Quit"];

const failedTransMessage = (ui: UIProvider) => {
    ui.write(
        "Failed to get indication of transaction completion from API!\nCheck result manually, or try again\n"
    );
};

const infoAction = async (provider: NetworkProvider, ui: UIProvider) => {
    const jettonData = await bundleContract.getJettonData();
    ui.write("Jetton info:\n\n");
    ui.write(`Admin:${jettonData.adminAddress}\n`);
    ui.write(`Total supply:${fromNano(jettonData.totalSupply)}\n`);
    ui.write(`Mintable:${jettonData.mintable}\n`);
    const displayContent = await ui.choose(
        "Display content?",
        ["Yes", "No"],
        (c) => c
    );
    if (displayContent == "Yes") {
        displayContentCell(jettonData.content, ui);
    }
};
const changeAdminAction = async (provider: NetworkProvider, ui: UIProvider) => {
    let retry: boolean;
    let newAdmin: Address;
    let curAdmin = await bundleContract.getOwnerAddress();
    do {
        retry = false;
        newAdmin = await promptAddress("Please specify new admin address:", ui);
        if (newAdmin.equals(curAdmin)) {
            retry = true;
            ui.write(
                "Address specified matched current admin address!\nPlease pick another one.\n"
            );
        } else {
            ui.write(
                `New admin address is going to be:${newAdmin}\nKindly double check it!\n`
            );
            retry = !(await promptBool("Is it ok?(yes/no)", ["yes", "no"], ui));
        }
    } while (retry);

    const curState = await provider
        .api()
        .getContractState(bundleContract.address);
    if (curState.lastTransaction === null)
        throw "Last transaction can't be null on deployed contract";

    await bundleContract.sendChangeAdmin(provider.sender(), newAdmin);
    const transDone = await waitForTransaction(
        provider,
        bundleContract.address,
        curState.lastTransaction.lt,
        10
    );
    if (transDone) {
        const adminAfter = await bundleContract.getOwnerAddress();
        if (adminAfter.equals(newAdmin)) {
            ui.write("Admin changed successfully");
        } else {
            ui.write("Admin address hasn't changed!\nSomething went wrong!\n");
        }
    } else {
    }
};

const addAction = async (provider: NetworkProvider, ui: UIProvider) => {
    const sender = provider.sender();
    let retry: boolean;
    let itemAddress: Address;

    do {
        retry = false;
        itemAddress = await promptAddress(
            `Please specify item address to add`,
            ui
        );
        ui.write(`Add item ${itemAddress} to pack.\n`);
        retry = !(await promptBool("Is it ok? (yes/no)", ["yes", "no"], ui));
    } while (retry);

    ui.write(`Sending add request\n`);
    const itemsBefore = await bundleContract.getCollectibles();
    const nanoMint = toNano(mintAmount);
    const { last } = await provider.api().getLastBlock();
    const curState = await provider
        .api()
        .getContractState(bundleContract.address);

    if (curState.lastTransaction === null)
        throw "Last transaction can't be null on deployed contract";

    const res = await bundleContract.sendMint(
        sender,
        mintAddress,
        nanoMint,
        toNano("0.05"),
        toNano("0.1")
    );
    const gotTrans = await waitForTransaction(
        provider,
        bundleContract.address,
        curState.lastTransaction.lt,
        10
    );
    if (gotTrans) {
        const supplyAfter = await bundleContract.getTotalSupply();

        if (supplyAfter == supplyBefore + nanoMint) {
            ui.write(
                "Mint successfull!\nCurrent supply:" + fromNano(supplyAfter)
            );
        } else {
            ui.write("Mint failed!");
        }
    } else {
        failedTransMessage(ui);
    }
};

export async function run(provider: NetworkProvider) {
    const ui = provider.ui();
    const sender = provider.sender();
    const hasSender = sender.address !== undefined;
    const api = provider.api();
    const code = await compile("Bundle");
    let done = false;
    let retry: boolean;
    let bundleAddress: Address;

    do {
        retry = false;
        bundleAddress = await promptAddress("Please enter minter address:", ui);
        const { last } = await api.getLastBlock();
        const { account } = await api.getAccount(last.seqno, bundleAddress);
        if (account.state.type !== "active" || account.state.code == null) {
            retry = true;
            ui.write(
                "This contract is not active! Please, use another address, or deploy it first."
            );
        } else {
            const stateCode = Cell.fromBase64(account.state.code);
            if (!stateCode.equals(code)) {
                ui.write(
                    "Contract code differs from the current contract version!\n"
                );
                const resp = await ui.choose(
                    "Use address anyway",
                    ["Yes", "No"],
                    (c) => c
                );
                retry = resp == "No";
            }
        }
    } while (retry);

    bundleContract = provider.open(Bundle.createFromAddress(bundleAddress));
    const isOwner = hasSender
        ? (await bundleContract.getOwnerAddress()).equals(sender.address)
        : true;
    let actionList: string[];
    if (isOwner) {
        actionList = [...adminActions, ...userActions];
        ui.write("Current wallet is the owner!\n");
    } else {
        actionList = userActions;
        ui.write(
            "Current wallet is not owner!\nAvaliable actions restricted\n"
        );
    }

    do {
        const action = await ui.choose("Pick action:", actionList, (c) => c);
        switch (action) {
            case "Add item":
                await addAction(provider, ui);
                break;
            case "Change admin":
                await changeAdminAction(provider, ui);
                break;
            case "Info":
                await infoAction(provider, ui);
                break;
            case "Quit":
                done = true;
                break;
        }
    } while (!done);
}
