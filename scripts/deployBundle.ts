import { Address, toNano } from "@ton/core";
import { Bundle } from "../wrappers/Bundle";
import { compile, NetworkProvider, sleep } from "@ton/blueprint";
import { DNSItemContract } from "../wrappers/DNSItem";

export async function run(provider: NetworkProvider, args: string[]) {
  const ui = provider.ui();
  const ownerAddress = provider.sender().address;

  if (!Address.isAddress(ownerAddress)) {
    throw new Error("No owner address");
  }

  const collectibles = (
    args.length > 0
      ? args[0]
      : await ui.input("NFT addresses (separrated by comma)")
  )
    .split(",")
    .map((addr) => Address.parse(addr));

  const bundle = provider.open(
    Bundle.createFromConfig(
      {
        owner: ownerAddress,
        collectibles: collectibles,
      },
      await compile("Bundle")
    )
  );

  await bundle.sendDeploy(provider.sender(), toNano("0.05"));

  await provider.waitForDeploy(bundle.address);

  const contractItems = await bundle.getCollectibles();
  if (contractItems.size !== collectibles.length) {
    throw new Error("Failed to init bundle");
  }

  // transfer item to pack
  ui.write("Transferring items to pack...");
  for (let addr of collectibles) {
    const dnsItem = provider.open(DNSItemContract.createFromAddress(addr));
    await dnsItem.sendTransfer(provider.sender(), bundle.address, ownerAddress);
    ui.write("Transfered NFT " + addr.toString() + "... Waiting 10 seconds.");
    sleep(10000);
  }
}
