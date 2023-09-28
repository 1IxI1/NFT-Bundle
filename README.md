# TON NFT Bundle Contract

A contract that owns several NFT Items, allowing you to transfer them and manage them as a package.

With add-on for acting with ".ton" and similar [contracts](https://github.com/ton-blockchain/dns-contract).


## Usage
You can use [the Dapp](https://1ixi1.github.io/NFT-Bundle)
to work with the contract or to deploy it.

Or, if you searching for code examples, you can take a look at
[scripts](scripts/) directory. It contains the following files you can run in CLI:

> The arguments in `[brackets]` will be asked interactively,
if you won't provide them with `yarn start`.

#### 1. deployBundle.ts
```
yarn start deployBundle [item1,item2,...]
```
Deploys the contract with initial set of items with specified addresses.

#### 2. addItem.ts
```
yarn start addItem [bundle-address] [item-address]
```
Adds new item to the contract.
Then it will try to transfer it to the contract.

#### 3. unpackOne.ts
```
yarn start unpackOne [bundle-address] [item-address | item-index]
```
Will search for item with given address or index on a contract and unpack it if found.
I.e. will transfer the item to owner.

#### 4. unpackAll.ts
```
yarn start unpackAll [bundle-address]
```
Will unpack all the items from bundle and destroy the contract on success.

#### 5. changeDNSRecord.ts
```
yarn start changeDNSRecord [bundle-address] [item-address | item-index] [key-number] [value-hex-b64-boc | nothing]
```
Will resend the request to change a DNS record
to given item if it exists and initialized.

#### 6. findTouches.ts
```
yarn start findTouches [bundle-address]
```
Will scan the contract and print items that may be touched.
With rewards information.

#### 7. touch.ts
```
yarn start touch [bundle-address] [item-address | item-index]
```
Will try to check the item for touch availability,
check rewards the contract can give and, if everything is ok,
will send the touch.
