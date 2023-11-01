# TON NFT Bundle Contract

A contract that owns several [NFT
Items](https://github.com/ton-blockchain/TEPs/blob/master/text/0062-nft-standard.md),
allowing you to transfer them and manage them as a package.

With an add-on for automatic renewal of [.ton
domains](https://github.com/ton-blockchain/dns-contract).

<img width=66%
src="https://github.com/1IxI1/NFT-Bundle/assets/53380262/a7fc160c-9041-42df-a847-ab98e8c04469"/>

## How it works & Usage

**The contract works as a layer.** He doesn't know which NFTs or domains
he owns.

Therefore, you do not need to worry about whether `transfer_notification`
will come to it when transferring an NFT item or not.

### Sending through bundle

For instant management of the NFT or domain (e.g. for changing the content
of some NFT), the contract has one method - **send**. This method simply
sends the messages attached to the request. Messages should have the form
of a cell (in ref), which is usually passed as an argument to
`send_raw_message` function.

```
actions#_ (HashmapE 48 ^MessageAny) = Actions;
send#2ecd9aca query_id:uint64 actions:Actions = InternalMsgBody;
```

Examples of composing a message for the _send method_ can be found in
[scripts/send.ts](scripts/send.ts).

### NFT Interface

The contract itself behaves like a regular NFT - it can be passed, it
has a `get_static_data` method, it has the necessary get methods. All in
accordance with the [TEP-62
standard](https://github.com/ton-blockchain/TEPs/blob/master/text/0062-nft-standard.md).

### Scheduling messages

The contract also implements domain renewal, or, more simply,
**scheduled messages**.

Scheduled messages are set by the contract owner. Each scheduled message
has a timestamp, upon reaching which, this message can be sent. Anyone can
send a message. And this _anyone_ will get a reward for every message
sent. By default, the reward is 0.36 TON.

Schedule request looks like send request. The only difference is that
during scheduling, message indexes in the _actions_ hashmap are important
\- they mean the time when messages should be sent.

Oh, and all messages should contain **0.005 TON** - the amount needed to
renew the domain - and no more.

```
schedule_actions#460da638 query_id:uint64 actions:Actions = InternalMsgBody;
```

See the composing example in [scripts/schedule.ts](scripts/schedule.ts).

### Triggering scheduled messages

All available messages are sent using the touch method. This method will
reward the recipient for each message sent. The recipient can protect
himself from receiving a lesser reward by specifying the `ensuring_key`
parameter in the message - the timer of one of the messages that he plans
to trigger.

```
touch#11111111 query_id:uint64 ensuring_key:(Maybe uint48) = InternalMsgBody;
```

See the example of sending a touch in
[scripts/touch.ts](scripts/touch.ts).


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

To run dapp locally, follow the instructions on the command line. To configure the dapp, you can use the [Blueprint documentation](https://github.com/ton-org/blueprint/blob/main/SCAFFOLD.md#configuration).

## License

MIT
