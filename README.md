# TON NFT Bundle Contract

A contract that owns several NFT Items, allowing you to transfer them and manage them as a package.

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

Предметы - DNS или NFT Items - хранятся в контракте в виде хэшмапы
следующего вида:

```
collectible#_ address:MsgAddress inited:Bool last_touch:uint48 = Item;
... collectibles:(HashmapE 8 Item) ...
```

`inited` - маркер, показывающий владеет ли Bundle контракт предметом или
ещё нет.

По задумке, при создании контракта, указанные в нем предметы должны быть
в неинициализированном состояниии `inited=0`.

Когда трансфер предмета происходит успешно и Bundle получает от одного из
предметов сообщение с `op::ownership_assigned` - `inited` у этого предмета
переходит в `true`, т.е. становится равным `-1`.

При этом же трансфере `last_touch` у предмета становится равным текущей
дате.

Хэшмапу с предметами можно получить с помощью get метода
`get_collectibles`.

Пример получения и обработки данных с помощью этого метода можно найти
в скрипте [getCollectibles.ts](scripts/getCollectibles.ts).

Для совершения действий `touch`, `unpack`, `change_dns_record_req`
в сообщении нужно указать индекс предмета в хэшмапе. Это можно сделать,
проитерировав хэшмапу, полученную от контракта. Пример поиска можно
увидеть в [wrappers/Bundle.ts](wrappers/Bundle.ts).

#### Adding items

Чтобы добавить в словарь новый предмет (им может быть любой контракт,
воплощающий
[TEP-64](https://github.com/ton-blockchain/TEPs/blob/master/text/0062-nft-standard.md#nft-item-smart-contract)),
владельцу нужно отправить на контракт сообщение следующего вида:

```
add_item#3b45b2d6 query_id:uint64 item_address:MsgAddress = InternalMsgBody;
```

После этого неинициализированный предмет появится в словаре.

#### Unpacks

Распаковкой называется удаление предмета из хранилища контракта и,
если он инициализирован, передача предмета от контракта к владельцу.

Для распаковки одного элемента владелец отправляет на контракт
сообщение с индексом предмета для распаковки:

```
unpack#855965fc query_id:uint64 target_index:uint8 = InternalMsgBody;
```

А после следующего сообщения контракт отправит владельцу все предметы
и остаток своего баланса, после чего самоуничтожится:

```
unpack_all#39e2f30b query_id:uint64 = InternalMsgBody;
```

### DNS Extension interfaces

#### Changing records

Как сказано выше, в контракте есть интерфейсы для работы с доменами.

Поменять ключ в одном из доменов, котрыми владеет Bundle, можно с помощью
внутреннего сообщения вида `change_dns_record_req`.

```
change_dns_record_req#5eb1f0f9 query_id:uint64 target_index:uint8
                               key:uint256 value:(Maybe ^Cell)
                               = InternalMsgBody;
```

Эта схема почти ничем не отличается от обычного запроса к домену
`change_dns_record`. Только в этом сообщении после `query_id` передается
`target_index` - индекс предмета в хэшмапе. Это, как можно догадаться,
нужно контракту для определения предмета, ключ которого нужно изменить (не
менять же у всех).

После всех проверок контракт отсылает `change_dns_record` классического
вида на адрес указанного домена. И, так как DNS предметы при таком
действии продляются, контракт тоже обновляет дату их `last_touch`.

> Важное замечание: Bundle контракт не может проверить точно чем
> завершится смена ключа на контракте домена. Возможен случай, что
> `content` на домене не будет содержать словаря, или что записей в этом
> словаре будет слишком много или что-нибудь другое. Тогда транзакция на
> предмете завершится с ошибкой и домен не продлится. Однако `last_touch`
> на Bundle контракте для этого предмета уже будет установлен на текущую
> дату. Это нарушит механизм награды за продление домена и в теории может
> привести к потере домена. Поэтому всегда проверяйте успешность полной
> цепочки транзакций.

#### Renewing system

Стандартные домены TON DNS имеют срок истечения в 1 год. Это значит, что
если купленный домен не продляли в течение года, кто угодно может
выставить его на аукцион. Владелец домена в таком случае рискует потерять
деньги и/или средства.

<i>Bundle контракт позволяет третьим лицам продлять домены за награду.</i>

Это значит, что по истечении 11 месяцев (параметр можно изменить [в
коде](contracts/bundle.fc#L20) перед деплоем), кто угодно может отправить
на контракт сообщение-касание и получить награду, если на контракте есть
деньги.

```
touch#11111111 query_id:uint64 target_index:uint8
               allow_min_reward:Bool = InternalMsgBody;
```

За успешное касание его инициатор получает `0.36 TON`.
Эта сумма также может быть [изменена](contracts/bundle.fc#L15). \
Инициатор [может получить](scripts/findTouches.ts#L21) данные об
актуальной награде по get методу `get_max_reward`.

Но это хорошо, когда контракт имеет деньги на награду. Ведь это выбор
владельца - оставлять на балансе деньги для продления доменов или нет.
Когда на контракте присутствует **только минимальный баланс** (нужен для
оплаты storage fee), инициатор касания получить награду не сможет.

Чтобы домогатель мог получить полную награду (за продление одного домена),
на контракте должно быть хотя бы `(reward + min_balance + touch_gas) TON`,
что с дефолтными параметрами составляет `0.05 + 0.36 + 0.01 = 0.42 TON`.

Значит расчет баланса контракта, необходимого для оплаты касаний всех
добавленных доменов можно сделать по формуле
`min_balance + storage_fee + N * (reward + touch_gas)`,
где `N` - количество добавленных
доменов. \
Подставим числа: `0.05 + 0.02 + N * (0.36 + 0.01)`

И немного успростим, получив совсем простой пример: \
`balance = 0.07 + N * 0.37`, где `N` - количество добавленных доменов.

Вот таблица минимальных рекомендованных балансов, необходимых
для корректной работы системы продления разного количества доменов:

| Domains | 1    | 2    | 3    | 4    | 5    | 6    | 7    | 8    | 9    | 10   |
| ------- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| Balance | 0.44 | 0.81 | 1.18 | 1.55 | 1.92 | 2.29 | 2.66 | 3.03 | 3.40 | 3.77 |

> Таблица для стандартных значений. Если параметры в контракте меняются -
> для расчетов нужно использовать данную формулу или пополнять контракт с большим запасом.

##### allow\_min\_reward

Но если вдруг монет для награды чуть-чуть не хватает - допустим,
свободно только `0.3 TON`, когда награда `0.36 TON` - домогатель может
указать в сообщении, что ему будет достаточно и этого. Для этой цели
в сообщении последний бит `allow_min_reward` устанавливается в `true`.

Если `allow_min_reward` будет `true`, а баланса для полной выплаты
будет достаточно, то домогатель получит всё те же `0.36 TON`.

[scripts/findTouches.ts](scripts/findTouches.ts) - Пример сканирования
Bundle контракта на возможность продления доменов.

[scripts/touch.ts](scripts/touch.ts) - Пример анализа баланса и отправки касания.

## Maintainance

#### Tests

Если вы планируете изменять код контракта, вам, возможно, захочется
его протестировать:

```
yarn test Bundle
```

Тесты можно изменить в [tests/Bundle.test.ts](tests/Bundle.spec.ts).

#### Dapp

Если после изменений в `wrappers/` или `contracts/` вы хотите далее
взаимодейстовать с контрактом через dapp, вам нужно обновить в нем
некоторые файлы:

```
yarn blueprint scaffold --update
```

Чтобы запустить dapp локально, следуйте инструкциям в командной строке.

## License

MIT
