const Buyback = artifacts.require("Buyback")
const TokenGNO = artifacts.require('TokenGNO')
const EtherToken = artifacts.require("EtherToken")
const DutchExchangeProxy = artifacts.require("DutchExchangeProxy")
const DutchExchange = artifacts.require("DutchExchange")
const TokenFRT = artifacts.require('TokenFRT')
const PriceOracleInterface = artifacts.require('PriceOracleInterface')
const TokenOWLProxy = artifacts.require('TokenOWLProxy')

const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545")) // Hardcoded development port

contract("Buyback", accounts => {
      
    let BuyBackAccount, SecondAccount, buyBack, etherToken, dxProxy, dx, tokenGNO, SecondBurnAddress, priceOracleInterface, tokenFRT, owlProxy ;

    BuyBackAccount = accounts[0]
    SecondAccount = accounts[1]
    BurnAddress = accounts[3]
    SecondBurnAddress = accounts[2]


    before ( async() => {
        
        Promise.all([
            TokenFRT.deployed(),
            EtherToken.deployed(),
            TokenGNO.deployed(),
            TokenOWLProxy.deployed(),
            PriceOracleInterface.deployed(),
            DutchExchange.deployed(),
            DutchExchangeProxy.deployed()
        ])

        dxProxy = await DutchExchangeProxy.deployed()
        tokenGNO = await TokenGNO.deployed()
        etherToken = await EtherToken.deployed()
        owlProxy = await TokenOWLProxy.deployed()
        tokenFRT =  await TokenFRT.deployed();
        priceOracleInterface = await PriceOracleInterface.deployed()
    })

    function fillSellOrders(){
        // approve the dutchx contract
        // etherToken
    }

    describe("Test Buyback Implementation", async() => {

        it("Should setup exchange", async()=> {
            const DEFAULT_THRESHOLD_NEW_TOKEN_PAIR_USD = 10000 // 10K USD
            const DEFAULT_THRESHOLD_AUCTION_START_USD = 1000 // 1K USD

            let thresholdNewTokenPairUsd = DEFAULT_THRESHOLD_NEW_TOKEN_PAIR_USD
            let thresholdAuctionStartUsd = DEFAULT_THRESHOLD_AUCTION_START_USD

            dx = DutchExchange.at(dxProxy.address)
            const owner = accounts[0]
            const frtAddress = TokenFRT.address
            const owlAddress = TokenOWLProxy.address
            const wethAddress = EtherToken.address
            const oracleAddress = PriceOracleInterface.address
      
            console.log('Setup DX with:')
            console.log('\t Owner: %s', owner)
            console.log('\t OWL address: %s', owlAddress)
            console.log('\t FRT address: %s', frtAddress)
            console.log('\t WETH address: %s', wethAddress)
            console.log('\t Price Oracle address: %s', oracleAddress)
            console.log('\t Threshold for new token pair: %s', thresholdNewTokenPairUsd)
            console.log('\t Threshold for auction to start: %s', thresholdAuctionStartUsd)
      
            await dx.setupDutchExchange(
              frtAddress,
              owlAddress,
              owner,
              wethAddress,
              oracleAddress,
              thresholdNewTokenPairUsd * 1e18,
              thresholdAuctionStartUsd * 1e18,
            {from: BuyBackAccount})
        })
        
        it("Should create contract", async() => {

            buyBack = await Buyback.new(dxProxy.address, tokenGNO.address, etherToken.address, BurnAddress, true, [0], [1e18], {from: BuyBackAccount})

            console.log(`buyBack address`, buyBack.address)
        })

        it("Should deposit tokens", async() => {
            // approve the buy back contract address to withdraw 1e18 tokens from etherToken
            await etherToken.deposit({from: BuyBackAccount, value: 30e18 })

            await etherToken.approve(buyBack.address, 20e18, {from: BuyBackAccount})

            await buyBack.deposit(etherToken.address, 20e18, {from: BuyBackAccount})
            let balanceOf = await etherToken.balanceOf.call(buyBack.address)
            console.log(`buyback balance ether `, balanceOf.toNumber() / 1e18)

        })

        it("Should allow to pariticipate in dutchx auction", async() => {
            
            const approve = await tokenGNO.approve(dx.address, 1e18, {from: BuyBackAccount})
            console.log({approve})

            const deposit = await dx.deposit(tokenGNO.address, 1e18, {from: BuyBackAccount});
            console.log({deposit})
            
            // const startAuction = await dx.getAuctionStart.call(tokenGNO.address, etherToken.address, {from: BuyBackAccount});
            // console.log({startAuction})
            
            // const auctionIndex = await dx.getAuctionIndex.call(tokenGNO.address, etherToken.address, {from: BuyBackAccount});
            // console.log({auctionIndex})

            const tokenPair = await dx.postSellOrder.call(tokenGNO.address, etherToken.address, 0, 1e18,  {from: BuyBackAccount})
            // // create sell order
            console.log({tokenPair})

            const result = await buyBack.getSellTokenBalance.call({from: BuyBackAccount})
            console.log(result.toNumber() / 1e18)

            const buy = await buyBack.postOrder({from: BuyBackAccount});
            console.log(buy.logs[0])

            const second = await buyBack.getSellTokenBalance.call({from: BuyBackAccount})
            console.log(second.toNumber() / 1e18)

        })

        // it("Should allow to claim funds from dutchx auction & burn it", async() => {
        //     await buyBack.claim({from: BuyBackAccount});
        // })
        // it("Should allow to claim funds from dutchx auction & burn it to an address", async() => {
        //     await buyBack.claim({from: BuyBackAccount});
        // })

        // it("Should allow to claim funds from dutchx auction & not burn it", async() => {
        //     await buyBack.claim({from: BuyBackAccount});
        // })

        // it("Should prevent deposit with amount 0", async() => {
        //     // approve the buy back contract address to withdraw 1e18 tokens from etherToken
        //     let errorThrown = false
        //     try {
        //         await buyBack.deposit(etherToken.address, 0, {from: BuyBackAccount})
        //     } catch(e) {
        //         errorThrown = true
        //     }
        //     assert.ok(errorThrown, "Should prevent deposit with amount 0");
        // })

        // it("Should prevent deposit of tokens different from the sell token", async() => {
        //     // approve the buy back contract address to withdraw 1e18 tokens from etherToken
        //     let errorThrown = false
        //     try {
        //         await buyBack.deposit(tokenGNO.address, 10e18, {from: BuyBackAccount})
        //     } catch(e) {
        //         errorThrown = true
        //     }
        //     assert.ok(errorThrown, "Should prevent deposit with amount 0");
        // })

        // const auctionIndexes = [1, 2, 3] 
        // const auctionAmounts = [1e17, 1e19, 1e18]

        // it("Should allow modification of auction amount & index", async () => {
           
        //     await buyBack.modifyAuctionsMulti(auctionIndexes, auctionAmounts)
        // })

        // it("Should prevent modifying auction with invalid length", async() => {
        //     let errorThrown = false
        //     try {
        //         let auctionIndexes = [1,2,3,4] 
        //         let auctionAmounts =  [1e17, 1e19]
        //         await buyBack.modifyAuctionsMulti(auctionIndexes, auctionAmounts)
        //     } catch(e) {
        //         errorThrown = true
        //     }
        //     assert.ok(errorThrown, "Should prevent modifying auction with invalid length");
        // })

        // it("Should prevent modifying auction with empty array", async() => {
        //     let errorThrown = false
        //     try {
        //         let auctionIndexes = [] 
        //         let auctionAmounts =  [1e17, 1e19]
        //         await buyBack.modifyAuctionsMulti(auctionIndexes, auctionAmounts)
        //     } catch(e) {
        //         errorThrown = true
        //     }
        //     assert.ok(errorThrown, "Should prevent modifying auction with invalid length");
        // })

        // it("Should get all the created auction indexes", async() => {
        //     const result = await buyBack.getAuctionIndexes({from: BuyBackAccount});

        //     assert.equal(result[0].toNumber(), auctionIndexes[0], "Invalid details")
        //     assert.equal(result[1].toNumber(), auctionIndexes[1], "Invalid details")
        //     assert.equal(result[2].toNumber(), auctionIndexes[2], "Invalid details")
        // })

        // it("Should get the auction amount with auction index", async() => {
        //     for(let index in auctionIndexes) {
        //         const result = await buyBack.getAuctionAmount(auctionIndexes[index], {from: BuyBackAccount});
        //         assert.equal(result.toNumber(), auctionAmounts[index], "Invalid details")
        //     }
        // })

        // it("Should delete an auction using auction index if its not pariticipated in ", async() => {
        //     const result = await buyBack.deleteAuction(0, {from: BuyBackAccount});

        //     assert.equal(result.logs[0].args.auctionIndex, auctionIndexes[0], "Failed to delete auction using index")
        //     assert.equal(result.logs[0].args.amount, auctionAmounts[0], "Failed to delete auction using index")
        // })

        // it("Should delete multiple auction amount with auction index", async() => {
        //     const result = await buyBack.deleteAuctionMulti([0, 0], {from: BuyBackAccount});
        //     let i = 1
        //     for(let log of result.logs){
        //         assert.equal(log.args.auctionIndex, auctionIndexes[i], "Failed to delete auction using index")
        //         assert.equal(log.args.amount, auctionAmounts[i], "Failed to delete auction using index")
        //         i++
        //     }
        // })

        // it("Should prevent deleting multiple auction with empty array", async() => {
        //     let errorThrown = false
        //     try {
        //         await buyBack.deleteAuctionMulti([], {from: BuyBackAccount});
        //     } catch(e) {
        //         errorThrown = true
        //     }
        //     assert.ok(errorThrown, "Should prevent deleting auction with invalid length");
        // });

        // it("Should allow to get burn address", async() => {
        //     const address = await buyBack.getBurnAddress({from: BuyBackAccount});
        //     assert.equal(address, BurnAddress, "Invalid burn addresses")
        // });

        // it("Should allow to modify burn", async() => {
        //     await buyBack.modifyBurn(true, {from: BuyBackAccount});
        // });

        // it("Should allow to modify burn address", async() => {
        //     await buyBack.modifyBurnAddress(SecondBurnAddress, {from: BuyBackAccount});
        //     const address = await buyBack.getBurnAddress({from: BuyBackAccount});
        //     assert.equal(address, SecondBurnAddress, "Invalid burn addresses")
        // });



        
    })
})