[![banner](images/banner.png)](https://bosonprotocol.io)

<h1 align="center">Boson Protocol V2</h1>

### [Intro](../README.md) | [Audits](audits.md) | [Setup](setup.md) | [Tasks](tasks.md) | [Architecture](architecture.md) | [Domain Model](domain.md) | [State Machines](state-machines.md) | [Sequences](sequences.md)

# Estimating the twin transfer limits

## Introduction

An offer can be part of a bundle that contains twins, i.e. tokens (ERC20, ERC721 or ERC1155) which are transferred to the buyer at redemption time. Protocol does not hold the twins in custody, but just tries to transfer them when the buyer redeems the voucher. If one or more twins cannot be transferred to the buyer, the voucher is still redeemed, but the exchange gets automatically disputed.  

The critical part of this process is that twin transfers are calls to external contracts. If they consume too much gas, Boson protocol may not have enough of it to finalize the redemption. Effectively that means that the buyer cannot redeem the voucher, so they can either cancel it or let it expire. In both cases, the seller collects the cancellation penalty without the need to deliver the item. This is a sort of DoS attack that the seller could execute.

To prevent it, Boson protocol v2.3.0 introduces the gas limit for external calls that facilitate the twin transfers. Even if the external call consumes all provided gas, Boson protocol would still be able to finalize the redemption. 

This document outlines how the limit is estimated and provides the instruction to redo the estimation in the future if the code that transfers the twin changes.

## Gas consumption during the voucher redemption

The `redeemVoucher` method can be split into the following parts:
1. operations between twin transfer loop [O1]
2. operations from the beginning of the loop till the external call [O2]
3. an external call that transfers the twin [E1]
4. operations after the external call till the end of the loop [O3]
5. operations after the loop [O4]

## Minimal gas requirements

We can describe the minimal gas requirements with the following statement:
> After the external call, contract must have enough gas to finalize the ongoing twin transfer, any other twin transfers and all the operations after the last twin is transferred.

Let's call this quantity `reservedGas`. Before we make an external call, we make sure that the available gas is higher than reserved gas and forward `availableGas - reservedGas` to the external contract. This ensures that no matter how much gas the external contract consumes, the protocol will still have enough gas after the transfer.

What is the reserved gas in terms of parts, denoted in the previous section?  
1. O1 are not important, since those operations already happened before the transfer and will not be repeated.
2. O2 are important if there are other twins that need to be transferred
3. E1 is not important. This is an external call that can in theory consumes an arbitrary amount of gas. If we wanted to estimate the minimum, where *all* external calls succeed, that is no less than the total block gas limit, which makes no sense as the lower boundary. But even more important than that is, even if don't forward enough gas or if the external call reverts for any reason, the protocol catches it and raises a dispute. But the redemption does not fail, therefore it's not important for the reserved gas.
4. O3 always happen after the transfer, so we must include them
5. O4 always happen after the transfer, so we must include them

If `n'` is the number of twins that are left to be transferred, and `C(o)` is the maximal cost of a set of operations `o`, we can express the `reservedGas` as
```
reservedGas = C(O4) + C(O3) + n'*(C(O2)+C(O3))
```

If `N` is the total number of twins to transfer, the `reservedGas` before the first external call should be
```
reservedGas = C(O4) + C(O3) + (N-1)*(C(O2)+C(O3))
```
After each external call, the reserved gas can be reduced for `C(O2)+C(O3)`.

The equations above suggest that we introduce 2 new protocol constants.
- `SINGLE_TWIN_RESERVED_GAS = C(O2)+C(O3)`
- `MINIMAL_RESIDUAL_GAS = C(O4) + C(O3)`

## Estimating the constants

Solidity has a special function `gasLeft()` which can be invoked at any point of execution to get the remaining gas. To get the estimates, one then only needs to call `gasLeft()` before and after a set of operations happens and subtract the second value from the first value. Since the end of one operations set presents the beginning of the next operations set, we need to put 5 measurement points in the code:
- Before O2
- After O2
- Before O3
- After O3 = Before O4
- After O4

To communicate the values outside the chain, one could use hardhat's `console.log` function which outputs the value in the terminal. Since calling this function adds something to the gas consumption, the estimates are not exact, but that is not problematic, since it's sensible to add some buffer on top of the estimates anyway.

Since different execution paths consume different amounts of gas it's advised to get the estimates in different scenarios (i.e. transfer of a single twin, multiple twins, failing twins, different types of twins etc.).

Once we get the estimations for individual operations sets (`C(O2)`, `C(O3)` and `C(O4)`) in different scenarios, it's important to take the maximum values (and not their averages). Then we can calculate the values for `SINGLE_TWIN_RESERVED_GAS` and `MINIMAL_RESIDUAL_GAS` as defined in the previous section. To get a final value, we add a sensible buffer (e.g. 10%) and round it to a nice-looking value.

### Estimation with script

This repository contains a script that automatically estimates the limits. It does the following:
1. Preprocesses the `transferTwins` method to add the `gasLeft()` measurement points. If it cannot reliably position the measurement points, it throws an error.
2. Runs the unit tests that cover the `transferTwins` method. This way we capture most of the sensible scenarios.
3. Captures the console.log output
4. Analyzes the output and estimates `SINGLE_TWIN_RESERVED_GAS` and `MINIMAL_RESIDUAL_GAS`

The preprocessing is the most volatile part. If `transferTwins` changes significantly, the script might be unable to reliably place the measurement points. In that case, one should either update the script to work with the new solidity code, or place the measurement points manually and disable the preprocessing.

To run a script, run the following command from the root folder of the project. It will print out the values for `SINGLE_TWIN_RESERVED_GAS` and `MINIMAL_RESIDUAL_GAS`.

```
node ./scripts/util/estimate-twin-transfer-limits.js
```

## Results

Estimation at commit f2a7993

| | Estimate | Used value |
|-|-|-|
| `SINGLE_TWIN_RESERVED_GAS` | `147,001` | `160,000` |
| `MINIMAL_RESIDUAL_GAS` | `207,084` | `230,000` |