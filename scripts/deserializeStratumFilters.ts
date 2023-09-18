import { Address, toNano, beginCell } from '@ton/core';
import { DNSPack } from '../wrappers/DNSPack';
import { compile, NetworkProvider } from '@ton/blueprint';


export async function run(provider: NetworkProvider) {
    const packAddress = Address.parse("EQBcVhuTGXAlDJuSFIz3fLl3EYIhRcIo-zWvIjBNBRLS6DSY");
    const dnsPack = provider.open(DNSPack.createFromAddress(packAddress));
    const ownerAddress = provider.sender().address
    if (ownerAddress === undefined) {
        throw new Error('No owner address');
    }

    console.log("ownerAddress", ownerAddress.hash.toString('hex'));

    
    const { filters } = await dnsPack.getPackData();
    console.log(filters.keys());
    let res = filters.get(ownerAddress.hash);
    console.log(res);
}
