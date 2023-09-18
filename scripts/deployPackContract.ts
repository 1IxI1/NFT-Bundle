import { Address, toNano, beginCell } from '@ton/core';
import { DNSPack } from '../wrappers/DNSPack';
import { compile, NetworkProvider } from '@ton/blueprint';


const WALLET_CATEGORY = BigInt('0xe8d44050873dba865aa7c170ab4cce64d90839a34dcfd6cf71d14e0205443b1b');
const MAX_TIME = BigInt('0xFFFFFFFFFFFFFFFF');

export async function run(provider: NetworkProvider) {
    const dnsItemAddress = Address.parse('EQA0uuol5y2v3wlIbpb_u3QH1imNgVGUNIyljNRg8JS5NQhM');
    const editorAddress = Address.parse('EQBkb28fExJEllBL1lRBvA0Gd2RaOx5GCJbwopnxPlNiWkW9');
    const ownerAddress = provider.sender().address

    if (ownerAddress === undefined) {
        throw new Error('No owner address');
    }

    const now = Math.floor(Date.now() / 1000);
    const dnsPack = provider.open(DNSPack.createFromConfig({
                domain_address: dnsItemAddress,
                expiresAt: now + 60 * 60 * 24 * 15,  // 15 days
                filters: [
                    {
                        editor: editorAddress,
                        isWhitelist: true,
                        categories: [
                            { category: WALLET_CATEGORY,
                                time: now + 60 * 60 * 24 * 14 },  // 14 days
                            { category: BigInt("111"),
                                time: now + 60 * 60 * 24 * 14 },  // 14 days
                        ]
                    },
                    {
                        editor: ownerAddress,
                        isWhitelist: false,
                        categories: [
                            { category: BigInt("111"), time: MAX_TIME },
                            { category: WALLET_CATEGORY, time: MAX_TIME },
                        ]
                    }
                ],
                return_address: ownerAddress,
            }, await compile('DNSPack')));

    await dnsPack.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(dnsPack.address);

    // transfer domain to pack
    await provider.sender().send({
        to: dnsItemAddress,
        value: toNano('0.075'),
        body: beginCell()
                .storeUint(0x5fcc3d14, 32)
                .storeUint(0, 64)
                .storeAddress(dnsPack.address)
                .storeAddress(null)
                .storeBit(false)
                .storeCoins(toNano('0.02'))
                .endCell()
    });

    setTimeout(async () => {
        console.log('Waiting for pack to init...');
    }, 10000);

    // try to remove wallet record
    // (should fail with exit code 502)
    await provider.sender().send({
        to: dnsPack.address,
        value: toNano('0.05'),
        body: beginCell()
             .storeUint(0x4eb1f0f9, 32)
             .storeUint(0, 64)
             .storeUint(WALLET_CATEGORY, 256)
             .endCell() 
    });
}
