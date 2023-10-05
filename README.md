# TON NFT Bundle Contract

A contract that owns several [NFT Items](https://github.com/ton-blockchain/TEPs/blob/master/text/0062-nft-standard.md),
allowing you to transfer them and manage them as a package.

With add-on for acting with ".ton" and similar [contracts](https://github.com/ton-blockchain/dns-contract).

<img width=66% src="https://github.com/1IxI1/NFT-Bundle/assets/53380262/ad52505a-2c00-4129-bbda-78d74ea499e5"/>

##### Main features:

-   Transfer many NFTs with one transaction
-   Unpack one or all the items at any time
-   Add new items (up to 250)
-   See your Bundle just as an NFT

### TON DNS Extension

<img width=66% src="https://github.com/1IxI1/NFT-Bundle/assets/53380262/030bad50-af33-4b73-8c67-698eeebf94b9"/>

The contract has built-in interfaces to work with domains.

##### Features:

-   Edit any keys in one of the DNS Items' hashmap at any moment
-   Stores last action timestamp for each item on its side
-   When domain expiration date is coming, lets people to renew your domain
    and receive reward in TON

## Usage

You can use [the Dapp](https://1ixi1.github.io/NFT-Bundle)
to do almost everything described below.

Or, if you searching for code examples, you can take a look at
[scripts](scripts/) directory. It contains the following files you can run
in CLI:

> The arguments in `[brackets]` will be asked interactively, if you won't
> provide them with `yarn start`.

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

#### 8. getCollectibles.ts

```
yarn start getCollectibles [bundle-address]
```

Will beautifully print collectibles hashmap for given bundle as table.

## Detailed contract description

### Items hashmap

Collectibles - DNS or NFT Items - are stored in the contract in the form of hashmaps of the following type:

```
collectible#_ address:MsgAddress inited:Bool last_touch:uint48 = Item;
... collectibles:(HashmapE 8 Item) ...
```

`inited` is a marker indicating whether the Bundle contract owns the item or not yet.

According to the idea, when creating a contract, the items specified in it should be in the uninitialized state `inited = 0`.

When the transfer of the item is successful and the Bundle receives a message from one of the items with `op::ownership_assigned` - `inited` for this item goes to `true`, i.e. it becomes equal to `-1`.

With the same transfer, the item's `last_touch` becomes equal to the current date.

Hashmap with items can be obtained using the get method `get_collectibles`.

An example of receiving and processing data using this method can be found in the script [getCollectibles.ts](scripts/getCollectibles.ts).

To perform the actions `touch`, `unpack`, `change_dns_record_req`, you need to _specify the index_ of the item you want to work with in the message. Index can be acquired by iterating the hashmap received from contract. An example of the search can be found in [wrappers/Bundle.ts](wrappers/Bundle.ts).

#### Adding items

To add a new collectible to the dictionary (item should implement [TEP-64](https://github.com/ton-blockchain/TEPs/blob/master/text/0062-nft-standard.md#nft-item-smart-contract)), owner needs to send the following message to contract:

```
add_item#3b45b2d6 query_id:uint64 item_address:MsgAddress = InternalMsgBody;
```

After that, the uninitialized item will appear in the dictionary.

#### Unpacking

Unpacking is the removal of an item from the contract dictionary and, if it is initialized, the transfer of the item from the contract to the owner.

To unpack one item, the owner sends a message to the contract with the index of the item to unpack:

```
unpack#855965fc query_id:uint64 target_index:uint8 = InternalMsgBody;
```

And after the message in the following form, the contract will send all the items and the rest of its balance to the owner, and after it will self-destruct:

```
unpack_all#39e2f30b query_id:uint64 = InternalMsgBody;
```

### DNS Extension interfaces

As mentioned above, the contract has interfaces for working with domains.

#### Changing records

You can change the key in one of the domains owned by Bundle using an internal message of the form `change_dns_record_req`.

```
change_dns_record_req#5eb1f0f9 query_id:uint64 target_index:uint8
                               key:uint256 value:(Maybe ^Cell)
                               = InternalMsgBody;
```

This scheme is almost no different from the usual request to the domain `change_dns_record`. Except that in this message, after `query_id`, `target_index` is passed - the index of the item in the hashmap. This, as you might guess, is necessary for the contract to determine the subject whose key needs to be changed (not to change at all).

After all checks, the contract sends the `change_dns_record` of the classic form to the address of the specified domain. And, since the DNS items with such an action increases the expiration date, the Bundle contract also updates the value of their `last_touch`.

> Important note: The Bundle contract cannot verify exactly how the key change on the domain contract will end. It is possible that the `content` on the domain will not contain a dictionary, or that there will be too many entries in this dictionary, or something else. Then the transaction on the item will fail with an error and the domain will not update its expiration date. However, the `last_touch` on the Bundle contract for this item will already be set to the current date. This will disrupt the reward mechanism for domain renewal and, in theory, may lead to the loss of the domain. Therefore, **always check the success of the complete transaction chain**.

#### Renewing system

Standard TON DNS domains have an expiration date of _1 year_. This means that if the purchased domain has not been renewed within a year, anyone can put it up for auction. In this case, the domain owner risks losing funds and/or the domain.

<i>Bundle contract allows third parties to renew domains for a reward.</i>

This means that after _11 months_ (the parameter can be changed [in the code](contracts/bundle.fc#L20) before the deployment), anyone can send a touch message to the contract and receive a reward if there is money on the contract.

```
touch#11111111 query_id:uint64 target_index:uint8
               allow_min_reward:Bool = InternalMsgBody;
```

For a successful touch, its initiator receives `0.36 TON`. This amount can also be [changed](contracts/bundle.fc#L15). \
The initiator [can get](scripts/findTouches.ts#L21) data about the current reward by the get method `get_max_reward`.

But it's good when a contract has money for a reward. After all, it is the owner's choice whether to leave money on the balance for domain renewal or not. When there is only a minimum balance on the contract (needed to pay the storage fee), the initiator of the touch will not be able to receive the reward.

In order for the harasser to receive the full reward (for the renewal of one domain), there must be at least `(reward + min_balance + touch_gas) TON` on the contract, which with the default parameters is `0.05 + 0.36 + 0.01 = 0.42 TON`.

So the calculation of the contract balance required to pay for touches of all added domains can be done using the formula `min_balance + storage_fee + N * (reward + touch_gas)`, where `N` is the number of added domains. \
Substitute the numbers: `0.05 + 0.02 + N * (0.36 + 0.01)`

And let's simplify it a little and get a very simple expression: \
`balance = 0.07 + N * 0.37`, where `N` is the number of domains added.

Here is a table of the minimum recommended balances required for the correct operation of the renewal system for a different number of domains:

| Domains | 1    | 2    | 3    | 4    | 5    | 6    | 7    | 8    | 9    | 10   |
| ------- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| Balance | 0.44 | 0.81 | 1.18 | 1.55 | 1.92 | 2.29 | 2.66 | 3.03 | 3.40 | 3.77 |

> Table for standard values. If the parameters in the contract change, you need to use the given formula for calculations or replenish the contract with a large margin.

##### allow\_min\_reward

But if suddenly there are not enough coins for the reward - for example, only `0.3 TON` is free, when the reward is `0.36 TON` - the harasser can indicate in the message that this will be enough for him. For this purpose, in the message, the last bit of `allow_min_reward` be set to `true`.

If `allow_min_reward` is `true`, and the balance for the full payment is enough, then the harasser will receive all the same `0.36 TON`.

[scripts/findTouches.ts](scripts/findTouches.ts) is an example of scanning a Bundle contract for the possibility of domain renewal.

[scripts/touch.ts](scripts/touch.ts) is an example of balance analysis and touch sending.

## Maintainance

#### Tests

If you plan to change the contract code, you may want to test it:

```
yarn test Bundle
```

Tests can be modified in [tests/Bundle.spec.ts](tests/Bundle.spec.ts).

#### Dapp

If after the changes in `wrappers/` or `contracts/` you want to further interact with the contract via dapp, you need to update some files in it:

```
yarn blueprint scaffold --update
```

To run dapp locally, follow the instructions on the command line. To configure the dapp, you can use the [Blueprint documentation](https://github.com/ton-org/blueprint/blob/main/SCAFFOLD.md#configuration ).

## License

MIT
