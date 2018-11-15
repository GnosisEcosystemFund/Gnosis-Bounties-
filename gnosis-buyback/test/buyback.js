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
const {
  waitUntilPriceIsXPercentOfPreviousPrice,
  getAuctionIndex,
  takeSnapshot,
  revertToSnapshot,
} =  require('./util')

contract('Buyback', (accounts) => {
  
  let buyBack, InitAccount, BuyBackAccount ,SecondAccount, etherToken, dxProxy, dx, tokenGNO, SecondBurnAddress, priceOracleInterface, tokenFRT, owlProxy ;

  InitAccount = accounts[0]
  SellerAccount  = accounts[1]
  BurnAddress    = accounts[2]
  SecondBurnAddress = accounts[3]

  before ( async() => {
    buyBack = await Buyback.deployed()
    BuyBackAccount = buyBack.address
    console.log({BuyBackAccount})

    const dxAddress = await buyBack.dx.call()

    dx = DutchExchange.at(dxAddress)
    
    tokenGNO = await TokenGNO.deployed()
    etherToken = await EtherToken.deployed()
    owlProxy = await TokenOWLProxy.deployed()
    tokenFRT =  await TokenFRT.deployed();
    priceOracleInterface = await PriceOracleInterface.deployed()
    
    const ethUsdPrice = await dx.ethUSDOracle.call()    
    console.log(`
      dx: ${dxAddress}
      buyBack: ${buyBack.address}
      ethUsdPrice: ${ethUsdPrice}
    `)
  })

  it("Should add buyback", async() => {
    await buyBack.addBuyBack(InitAccount,  tokenGNO.address, etherToken.address, BurnAddress, true, [0,0], [1e18,1e18], 0, {from: InitAccount}); 
  })

  it("Should remove buyback", async() => {
    await buyBack.removeBuyBack(InitAccount, {from: InitAccount});
  })




  it("Should deposit tokens", async() => {
    await etherToken.deposit({from: InitAccount, value: 100e18 })

    await etherToken.transfer(SellerAccount, 20e18, {from: InitAccount})
    await tokenGNO.transfer(SellerAccount, 20e18, {from: InitAccount})


    // approve the buy back contract address to withdraw 1e18 tokens from etherToken
    await etherToken.approve(BuyBackAccount, 40e18, {from: InitAccount})

    // deposits ethertoken
    await buyBack.depositSellToken(InitAccount, 20e18, {from: InitAccount})
    await buyBack.depositSellToken(InitAccount, 20e18, {from: InitAccount})


    const balance = await buyBack.getSellTokenBalance(InitAccount, {from: InitAccount})

    assert.equal(balance.toNumber(), 40e18, "Failed to deposit tokens")

    console.log(`
    ------------- Beginning Balances --------------- \n
    Seller Account - \n
    \t EtherToken = ${await etherToken.balanceOf.call(SellerAccount) / 1e18}
    \t TokenGNO: ${await tokenGNO.balanceOf.call(SellerAccount) / 1e18}
    Init Acccount - \n
    \t EtherToken = ${await etherToken.balanceOf.call(InitAccount) / 1e18}
    \t TokenGNO: ${await tokenGNO.balanceOf.call(InitAccount) / 1e18}
    BuyBack Balance - \n
    \t EtherToken = ${await etherToken.balanceOf.call(BuyBackAccount) / 1e18}
    \t TokenGNO: ${await tokenGNO.balanceOf.call(BuyBackAccount) / 1e18}
    -------------------------------------
    `)
  })

  it("Should allow to pariticipate in dutchx auction, claim funds & burn it to an address", async() => {
    let snap_id = await takeSnapshot();

    const approve = await tokenGNO.approve(dx.address, 10e18, {from: SellerAccount})
    console.log({approve})

    const etherApprove = await etherToken.approve(dx.address, 10e18, {from: SellerAccount})
    console.log({etherApprove})

    const depositToken = await dx.deposit(tokenGNO.address, 10e18, {from: SellerAccount});
    console.log({depositToken})

    const depositEther =  await dx.deposit(etherToken.address, 10e18, {from: SellerAccount});
    console.log({depositEther})

    const tokenPair = await dx.addTokenPair(etherToken.address, tokenGNO.address, 2e18, 0, 2, 1, {from: SellerAccount})
    console.log({tokenPair})

    const auctionIndex = (await dx.getAuctionIndex.call(etherToken.address, tokenGNO.address)).toNumber();
    console.log({auctionIndex})

    // // create sell order

    const result = await buyBack.getSellTokenBalance(InitAccount, {from: InitAccount})
    console.log(result.toNumber() / 1e18)

    const sellOrder = await buyBack.postSellOrder(InitAccount, {from: InitAccount});

    console.log(sellOrder.logs[0])
    console.log('sellorder')
    console.log(sellOrder.logs[0].args.newSellerBalance.toNumber())


    let buyVolumes = (await dx.buyVolumes.call(etherToken.address, tokenGNO.address)).toNumber()
    let sellVolumes = (await dx.sellVolumesCurrent.call(etherToken.address, tokenGNO.address)).toNumber()

    console.log(`
    ----
    Current Buy Volume BEFORE Posting => ${buyVolumes}
    Current Sell Volume               => ${sellVolumes}
    ----
    `)

    await waitUntilPriceIsXPercentOfPreviousPrice(dx, etherToken, tokenGNO, 1)

    const buyOrder = await dx.postBuyOrder(etherToken.address, tokenGNO.address, 1, 10e18,  {from: SellerAccount})
    console.log({buyOrder})
    // const buyOrder1 = await dx.postBuyOrder(etherToken.address, tokenGNO.address, 1, 2e18,  {from: SellerAccount})
    // console.log({buyOrder1})


    console.log('balance of seller', (await dx.balances.call(tokenGNO.address, SellerAccount)).toNumber())

    
  //   // const startAuction = await dx.getAuctionStart.call(tokenGNO.address, etherToken.address, {from: BuyBackAccount});
  //   // console.log({startAuction})
    
  //   //
    console.log("auction index")
    console.log(await getAuctionIndex(dx, tokenGNO, etherToken))
    const auctionWasClosed = (auctionIndex + 1 === (await getAuctionIndex(dx, tokenGNO, etherToken)))
    console.log({auctionWasClosed})

    const getBuyerBalance = (await dx.buyerBalances.call(etherToken.address, tokenGNO.address,  1, SellerAccount)).toNumber()
    console.log({getBuyerBalance})

    const getSellerBalance = (await dx.sellerBalances.call(etherToken.address, tokenGNO.address, 1, BuyBackAccount)).toNumber()
    console.log({getSellerBalance})

  //   const second = await buyBack.getSellTokenBalance.call({from: BuyBackAccount})
  //   console.log(second.toNumber() / 1e18)

   buyVolumes = (await dx.buyVolumes.call(etherToken.address, tokenGNO.address))
     sellVolumes = (await dx.sellVolumesCurrent.call(etherToken.address, tokenGNO.address))

    console.log(`
    ----
    Current Buy Volume BEFORE Posting => ${buyVolumes}
    Current Sell Volume               => ${sellVolumes}
    ----
    `)

    const claimFunds = await buyBack.claim(InitAccount, {from: InitAccount});
    console.log({claimFunds})

    // check burn address for balance
    const burnBalance = (await tokenGNO.balanceOf.call(BurnAddress)).toNumber()
    console.log({burnBalance})
      // const cliam = await buyBack.

    
    await revertToSnapshot(snap_id)
  })

  it("Should be able to claim funds and burn it", async() => {



  })

})