const assert = require("assert");
const BN = require('bignumber.js')
const fs = require('fs')

const { checkGetFail, checkTransactionFailed, checkTransactionPassed, advanceTime, advanceBlock, takeSnapshot, revertToSnapShot, advanceTimeAndBlock } = require("./lib/utils.js");
const { maxUint256, PancakeRouter, PancakeFactory, PancakePair, DividendDistributor, Nova, ERC20Token, ERC20 } = require('../migrations/lib/const')

const { setWeb3 } = require('../migrations/lib/deploy')
const deployParams = require('../migrations/deploy-localhost.json');

let errorMessages = {
    alreadySet: 'Already Set',
    insufficientAllowance: 'ERC20: insufficient allowance',
    notLocked: 'Not Locked',
    notExpired: 'Not Expired'
}

const BN2Decimal = (t, decimal) => {
    if (decimal === undefined) decimal = 18
    return BN(t).div(BN(`1e${decimal}`)).toString()
}

contract("Nova", accounts => {
    let tokenContract
    let tokenPair;
    let routerContract
    let wethAddress
    let rewardTokenContract
    let rewardTokenPair
    let dividendContract
    let factoryContract
    let treasuryAddress
    let tokenDecimals
    let maxWallet
    let maxBuyPerDay
    let maxSellPerDay

    let deployer = accounts[0]

    let user1 = accounts[1]
    let user2 = accounts[2]
    let user3 = accounts[3]

    let rewardTreasuryAddress = accounts[7]

    let oneTimeBuy = new BN('12000000')

    const tokenBalance = async (w) => {
        let bal = await tokenContract.balanceOf(w)
        return BN2Decimal(bal.toString(), tokenDecimals)
    }

    const rewardTokenBalance = async (w) => {
        let bal = await rewardTokenContract.balanceOf(w)
        return BN2Decimal(bal.toString(), 18)
    }

    const ethBalance = async (w) => {
        let bal = await web3.eth.getBalance(w)
        return web3.utils.fromWei(bal)
    }

    before (async () => {
        let routerInfo = deployParams.find(t => t.name === "PancakeRouter")
        let factoryInfo = deployParams.find(t => t.name === 'PancakeFactory')
        let wbnbInfo = deployParams.find(t => t.name === 'WBNB')
        let tokenInfo = deployParams.find(t => t.name === 'Nova')
        let rewardTokenInfo = deployParams.find(t => t.name === 'TestRewardToken')
        let dividendInfo = deployParams.find(t => t.name === 'DividendDistributor')

        wethAddress = wbnbInfo.imple
        tokenContract = await Nova.at(tokenInfo.imple)
        rewardTokenContract = await ERC20Token.at(rewardTokenInfo.imple)
        routerContract = await PancakeRouter.at(routerInfo.imple)
        treasuryAddress = await tokenContract.treasuryReceiver()
        tokenDecimals = parseInt((await tokenContract.decimals()).toString())
        console.log("treasury Balance=", await tokenBalance(treasuryAddress));
        factoryContract = await PancakeFactory.at(factoryInfo.imple)
        dividendContract = await DividendDistributor.at(dividendInfo.imple)

        maxWallet = await tokenContract.getMaxTokenPerWallet()
        maxBuyPerDay = await tokenContract.getTimeframeQuotaIn()
        maxSellPerDay = await tokenContract.getTimeframeQuotaOut()

          // await tokenContract.setFeeTokenPath([wethAddress, rewardTokenContract.address]);
        // await rewardTokenContract.setFeeToken(rewardTokenContract.address);
        
        setWeb3(web3)
    })

    it ("ddd", async () => {
        await tokenContract.setSwapThresholdValues(0, 0);
        const _maxLPSwapThreshold = await tokenContract.maxLPSwapThreshold();
        console.log("maxLPSwapThreshold:", BN2Decimal(_maxLPSwapThreshold, tokenDecimals));
        const _maxETHFeeSwapThreshold = await tokenContract.maxETHFeeSwapThreshold();
        console.log("maxETHFeeSwapThreshold:", BN2Decimal(_maxETHFeeSwapThreshold, tokenDecimals));
    })

    it ("Adding to the liquidity for reward token", async () => {
        console.log("rewardTokenContract reward token balance=", await rewardTokenBalance(rewardTokenContract.address));
        console.log("rewardTreasury reward token balance=", await rewardTokenBalance(rewardTreasuryAddress));
        await rewardTokenContract.transfer(rewardTreasuryAddress, "30000000000000000000000");
        console.log("rewardTreasury reward token balance=", await rewardTokenBalance(rewardTreasuryAddress));
        
        await rewardTokenContract.approve(routerContract.address, "9000000000000000000000000000", {from: rewardTreasuryAddress});
        const _allowance = await rewardTokenContract.allowance(rewardTreasuryAddress, routerContract.address);
        console.log("rewardTreasury -> routerContract, allowance=", BN2Decimal(_allowance.toString(), 18));
        console.log("rewardTokenContract balance:", await rewardTokenBalance(rewardTokenContract.address));
        /// 2000 reward = 1.5 eth
        await routerContract.addLiquidityETH(rewardTokenContract.address, "2000000000000000000000", 0, 0, rewardTreasuryAddress, '0xffffffff', {from: rewardTreasuryAddress, value: web3.utils.toWei('1.5')} );
        console.log("Reward token pair:", await factoryContract.getPair(wethAddress, rewardTokenContract.address));
        rewardTokenPair = await factoryContract.getPair(wethAddress, rewardTokenContract.address)
        
    })

    it ("Adding to the liquidity", async () => {
        let tokenInfo = deployParams.find(t => t.name === 'Nova')
        console.log("tokenContract balance=", await tokenBalance(tokenInfo.imple));
        console.log("treasury balance:", await tokenBalance(treasuryAddress));
        await tokenContract.approve(routerContract.address, "9000000000000", {from: treasuryAddress})
        const _allowance = await tokenContract.allowance(treasuryAddress, routerContract.address);
        console.log("treasuryAddress -> routerContract, allowance=", BN2Decimal(_allowance.toString(), tokenDecimals));
        /// 10000 NOVA = 2 eth
        await routerContract.addLiquidityETH(tokenContract.address, '1000000000', 0, 0, treasuryAddress, '0xffffffff', {from: treasuryAddress, value: web3.utils.toWei('2')})
        console.log("after addLiquidityETH treasury balance:", await tokenBalance(treasuryAddress));

        let pair = await tokenContract.pair()
        const pairContract = await PancakePair.at(pair)
        let res = await pairContract.getReserves()
        let token0 = await pairContract.token0()

        let tokenIndex = 1
        let ethIndex = 0
        if (token0.toLowerCase() === tokenContract.address.toLowerCase()) {
            tokenIndex = 0
            ethIndex = 1
        }

        console.log('Pair', BN2Decimal(res[tokenIndex].toString(), tokenDecimals.toString()), web3.utils.fromWei(res[ethIndex].toString()))
        console.log("Nova pair:", await factoryContract.getPair(wethAddress, tokenContract.address));
        tokenPair = await factoryContract.getPair(wethAddress, tokenContract.address);
    })

    it ("Buying tokens", async () => {
        console.log('max wallet', BN2Decimal(maxWallet.toString(), tokenDecimals))
        console.log('max buy per day', BN2Decimal(maxBuyPerDay.toString(), tokenDecimals))
        console.log('max sell per day', BN2Decimal(maxSellPerDay.toString(), tokenDecimals))

        let info = await tokenContract.getOverviewOf(user1)
        console.log(">>> user1's overview now")
        console.log('now', parseInt(info[5].toString()))
        console.log('reset at', parseInt(info[0].toString()))
        console.log('buy amount remainning', BN2Decimal(info[3].toString(), tokenDecimals))
        console.log('sell amount remainning', BN2Decimal(info[4].toString(), tokenDecimals))
        console.log('user1 balance', await tokenBalance(user1))
        console.log('firePit balance', await tokenBalance(await tokenContract.firePit()))
        console.log('self balance', await tokenBalance(tokenContract.address))
        console.log('autoLiquidityReceiver balance', await tokenBalance(await tokenContract.autoLiquidityReceiver()))

        let ta = await routerContract.getAmountsOut(oneTimeBuy.toString(), [tokenContract.address, wethAddress])
        await routerContract.swapExactETHForTokensSupportingFeeOnTransferTokens(0, [wethAddress, tokenContract.address], user1, '0xffffffff', {from: user1, value: ta[ta.length - 1].toString()})

        info = await tokenContract.getOverviewOf(user1)
        console.log(">>> user1's overview after buying", BN2Decimal(oneTimeBuy.toString(), tokenDecimals))
        console.log('now', parseInt(info[5].toString()))
        console.log('reset at', parseInt(info[0].toString()))
        console.log('reset at', info[1].toString())
        console.log('reset at', info[2].toString())
        console.log('buy amount remainning', BN2Decimal(info[3].toString(), tokenDecimals))
        console.log('sell amount remainning', BN2Decimal(info[4].toString(), tokenDecimals))
        console.log('user1 balance', await tokenBalance(user1))
        console.log('firePit balance', await tokenBalance(await tokenContract.firePit()))
        console.log('self balance', await tokenBalance(tokenContract.address))
        console.log('autoLiquidityReceiver balance', await tokenBalance(await tokenContract.autoLiquidityReceiver()))
    })

    it ("user2 and user3 buy", async () => {
        console.log('firePit balance', await tokenBalance(await tokenContract.firePit()))
        console.log('self balance', await tokenBalance(tokenContract.address))
        console.log('autoLiquidityReceiver balance', await tokenBalance(await tokenContract.autoLiquidityReceiver()))

        let ta = await routerContract.getAmountsOut(oneTimeBuy.toString(), [tokenContract.address, wethAddress])
        await routerContract.swapExactETHForTokensSupportingFeeOnTransferTokens(0, [wethAddress, tokenContract.address], user2, '0xffffffff', {from: user2, value: ta[ta.length - 1].toString()})

        ta = await routerContract.getAmountsOut(oneTimeBuy.toString(), [tokenContract.address, wethAddress])
        await routerContract.swapExactETHForTokensSupportingFeeOnTransferTokens(0, [wethAddress, tokenContract.address], user3, '0xffffffff', {from: user3, value: ta[ta.length - 1].toString()})

        console.log('firePit balance', await tokenBalance(await tokenContract.firePit()))
        console.log('self balance', await tokenBalance(tokenContract.address))
        console.log('autoLiquidityReceiver balance', await tokenBalance(await tokenContract.autoLiquidityReceiver()))
    })

    it ("distribution of reward token", async () => {

        let _liquidityFeeOnBuy = await tokenContract.liquidityFeeOnBuy()
        let _treasuryFeeOnBuy = await tokenContract.treasuryFeeOnBuy()
        let _insuranceFundFeeOnBuy = await tokenContract.insuranceFundFeeOnBuy()
        let _firePitFeeOnBuy = await tokenContract.firePitFeeOnBuy()
        await tokenContract.setFeePercentagesOnBuy(_liquidityFeeOnBuy, _treasuryFeeOnBuy, _insuranceFundFeeOnBuy, 100, _firePitFeeOnBuy);
        let _ethFeeOnBuy = await tokenContract.ethFeeOnBuy()
        console.log("new ethFeeOnBuy: ", _ethFeeOnBuy.toString())
        console.log('treasury reward balance:', await rewardTokenBalance(await tokenContract.treasuryReceiver()))
        console.log('dev reward balance:', await rewardTokenBalance(await tokenContract.devAddress()))
        console.log('insurance reward balance:', await rewardTokenBalance(await tokenContract.insuranceFundReceiver()))
        console.log('reflection reward balance:', await rewardTokenBalance(await tokenContract.distributorAddress()))
        console.log('user1 reward balance:', await rewardTokenBalance(user1))
        console.log('user2 reward balance:', await rewardTokenBalance(user2))
        console.log('user3 reward balance:', await rewardTokenBalance(user3))

        
        await tokenContract.transfer(accounts[9], '1000000', {from: treasuryAddress})

        const _ethRewardStore = await tokenContract.ethRewardStore();
        let ta = await routerContract.getAmountsOut(_ethRewardStore, [wethAddress, rewardTokenContract.address]);
        console.log("_ethRewardStore:", BN2Decimal(_ethRewardStore, 18))
        console.log("Expected rewardToken:", BN(ta[0]).toString())
        console.log("Expected rewardToken:", BN(ta[1]).toString())

        console.log('treasury reward token', await rewardTokenBalance(await tokenContract.treasuryReceiver()))
        console.log('dev reward token', await rewardTokenBalance(await tokenContract.devAddress()))
        console.log('insurance reward token', await rewardTokenBalance(await tokenContract.insuranceFundReceiver()))
        const _reflectionReward = await rewardTokenContract.balanceOf(await tokenContract.distributorAddress());
        console.log('reflection reward token', _reflectionReward.toString());
        let _rewardBalanceOfUser1 = await rewardTokenContract.balanceOf(user1);
        let _rewardBalanceOfUser2 = await rewardTokenContract.balanceOf(user2);
        let _rewardBalanceOfUser3 = await rewardTokenContract.balanceOf(user3);
        console.log('user1 reward token', _rewardBalanceOfUser1.toString())
        console.log('user2 reward token', _rewardBalanceOfUser2.toString())
        console.log('user3 reward token', _rewardBalanceOfUser3.toString())
        console.log("total=", _rewardBalanceOfUser1.add(_rewardBalanceOfUser2).add(_rewardBalanceOfUser3).add(_reflectionReward).toString());

        await advanceTimeAndBlock(3601);

        // await tokenContract.transfer(accounts[9], '1000000', {from: treasuryAddress})
        _rewardBalanceOfUser1 = await rewardTokenContract.balanceOf(user1);
        _rewardBalanceOfUser2 = await rewardTokenContract.balanceOf(user2);
        _rewardBalanceOfUser3 = await rewardTokenContract.balanceOf(user3);
        let _tokenBalanceOfUser1 = await tokenContract.balanceOf(user1);
        let _tokenBalanceOfUser2 = await tokenContract.balanceOf(user2);
        let _tokenBalanceOfUser3 = await tokenContract.balanceOf(user3);
        console.log('user1 reward token', await rewardTokenBalance(user1))
        console.log('user2 reward token', await rewardTokenBalance(user2))
        console.log('user3 reward token', await rewardTokenBalance(user3))
        console.log("rate of User1:", BN(_rewardBalanceOfUser1).div(BN(_tokenBalanceOfUser1)).toString())
        console.log("rate of User2:", BN(_rewardBalanceOfUser2).div(BN(_tokenBalanceOfUser2)).toString())
        console.log("rate of User3:", BN(_rewardBalanceOfUser3).div(BN(_tokenBalanceOfUser3)).toString())
    })

    // it ("distribution of ETH", async () => {
    //     console.log('treasury ETH', await ethBalance(await tokenContract.treasuryReceiver()))
    //     console.log('dev ETH', await ethBalance(await tokenContract.devAddress()))
    //     console.log('insurance ETH', await ethBalance(await tokenContract.insuranceFundReceiver()))
    //     console.log('reflection ETH', await ethBalance(await tokenContract.distributorAddress()))
    //     console.log('user1 ETH', await ethBalance(user1))
    //     console.log('user2 ETH', await ethBalance(user2))
    //     console.log('user3 ETH', await ethBalance(user3))

    //     await tokenContract.transfer(accounts[9], '1000000', {from: treasuryAddress})

    //     console.log('treasury ETH', await ethBalance(await tokenContract.treasuryReceiver()))
    //     console.log('dev ETH', await ethBalance(await tokenContract.devAddress()))
    //     console.log('insurance ETH', await ethBalance(await tokenContract.insuranceFundReceiver()))
    //     console.log('reflection ETH', await ethBalance(await tokenContract.distributorAddress()))

    //     await advanceTimeAndBlock(3601);

    //     await tokenContract.transfer(accounts[9], '1000000', {from: treasuryAddress})

    //     console.log('user1 ETH', await ethBalance(user1))
    //     console.log('user2 ETH', await ethBalance(user2))
    //     console.log('user3 ETH', await ethBalance(user3))
    // })

    it("rebase", async () => {
        await tokenContract.setAutoRebase(true)
        console.log('user1 balance', await tokenBalance(user1))
        await advanceTimeAndBlock(86400)
        await tokenContract.transfer(user3, '100000', {from: user2})
        console.log('user1 balance', await tokenBalance(user1))
    })
})
