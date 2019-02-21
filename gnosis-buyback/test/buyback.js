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
  catchRevert,
  increaseTime
} = require('./util')

contract('Buyback', (accounts) => {
  
  const deposit = async () => {
    await etherToken.deposit({from: InitAccount, value: 100e18 })

    await etherToken.transfer(SellerAccount, 20e18, {from: InitAccount})
    await tokenGNO.transfer(SellerAccount, 20e18, {from: InitAccount})

    // approve the buy back contract address to withdraw 1e18 tokens from etherToken
    await etherToken.approve(BuyBackAccount, 40e18, {from: InitAccount})

    // deposits ethertoken
    await buyBack.depositSellToken(40e18, {from: InitAccount})

    const balance = await buyBack.getSellTokenBalance({from: InitAccount})
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
  }

  const approveAndDepositTradingAmounts = async () => {

    await tokenGNO.approve(dx.address, 10e18, {from: SellerAccount})
    await etherToken.approve(dx.address, 10e18, {from: SellerAccount})

    await dx.deposit(tokenGNO.address, 10e18, {from: SellerAccount});
    await dx.deposit(etherToken.address, 10e18, {from: SellerAccount});
    await dx.addTokenPair(etherToken.address, tokenGNO.address, 2e18, 0, 2, 1, {from: SellerAccount})   
  }


  const tradeGNOETH = async() => {
    const auctionIndex = (await dx.getAuctionIndex.call(etherToken.address, tokenGNO.address)).toNumber();
    assert.equal(auctionIndex, 1, "Failed to create auction");

    await waitUntilPriceIsXPercentOfPreviousPrice(dx, etherToken, tokenGNO, 1)
    await dx.postBuyOrder(etherToken.address, tokenGNO.address, 1, 10e18,  {from: SellerAccount})

    const auctionWasClosed = (auctionIndex + 1 === (await getAuctionIndex(dx, tokenGNO, etherToken)))
    assert.equal(auctionWasClosed, true, "Failed to close auction error")
  }

  const performAuctionAndClaim = async() => {
    await approveAndDepositTradingAmounts();

    const auctionIndex = (await dx.getAuctionIndex.call(etherToken.address, tokenGNO.address)).toNumber();
    assert.equal(auctionIndex, 1, "Failed to create auction");
    
    await buyBack.postSellOrder(InitAccount, {from: InitAccount});

    await waitUntilPriceIsXPercentOfPreviousPrice(dx, etherToken, tokenGNO, 1)
    await dx.postBuyOrder(etherToken.address, tokenGNO.address, 1, 10e18,  {from: SellerAccount})

    const auctionWasClosed = (auctionIndex + 1 === (await getAuctionIndex(dx, tokenGNO, etherToken)))
    assert.equal(auctionWasClosed, true, "Failed to close auction error")

    const claim = await buyBack.claim(InitAccount, {from: InitAccount});
    assert.equal()
  }


  let buyBack, 
      InitAccount, 
      BuyBackAccount ,
      SecondAccount, 
      etherToken, dxProxy, 
      dx, 
      tokenGNO, 
      SecondBurnAddress, 
      priceOracleInterface, 
      tokenFRT, 
      owlProxy, 
      snapId ;

  InitAccount       = accounts[0]
  SellerAccount     = accounts[1]
  BurnAddress       = accounts[2]
  SecondBurnAddress = accounts[3]
  WithdrawalAddress = accounts[4]

  before ( async() => {
    buyBack = await Buyback.deployed()
    BuyBackAccount = buyBack.address

    const dxAddress = await buyBack.dx.call()

    dx = DutchExchange.at(dxAddress)
    
    tokenGNO   = await TokenGNO.deployed()
    etherToken = await EtherToken.deployed()
    owlProxy   = await TokenOWLProxy.deployed()
    tokenFRT   =  await TokenFRT.deployed();
    priceOracleInterface = await PriceOracleInterface.deployed()
    
    const ethUsdPrice = await dx.ethUSDOracle.call()    
    console.log(`
      dx: ${dxAddress}
      buyBack: ${buyBack.address}
      ethUsdPrice: ${ethUsdPrice}
    `)

    // takeSnapshot
    snapId = await takeSnapshot();
  })

  afterEach('revert the blockchain snapshot', async function () {
    await revertToSnapshot(snapId) // revert to the snapshot
    snapId = await takeSnapshot();
  })

  it("Should prevent adding buyback with invalid arrays", async() => {
    catchRevert(
      buyBack.addBuyBack(
        tokenGNO.address, 
        etherToken.address, 
        BurnAddress,
        true, 
        [0,1], 
        [1e18], 0, true, web3.utils.toWei("1", 'ether'),
        {from: InitAccount}
      )
    )
  })

  it("Should deposit tokens", async() => {
    // deposit tokens
    await deposit();
  })

  it("Should add buyback", async() => {
    // deposit tokens
    await deposit();

    // create buyback
    const tx = await buyBack.addBuyBack(
                        tokenGNO.address, 
                        etherToken.address, 
                        BurnAddress,
                        true, 
                        [0,1], 
                        [1e18,1e18], 0, true, web3.utils.toWei("1", 'ether'),
                        {from: InitAccount}); 

    assert.equal(tx.logs[0].args.userAddress, InitAccount, "failed to add buyback");
  })

  it("Should deposit ether into buyback", async() => {
    // deposit tokens
    await deposit();

    // add buyback
    await buyBack.addBuyBack(
      tokenGNO.address, 
      etherToken.address, 
      BurnAddress,
      true, 
      [0,1], 
      [1e18,1e18], 0, true, web3.utils.toWei("1", 'ether'),
      {from: InitAccount}); 
    
      // send ether
    await buyBack.sendTransaction({from: InitAccount, value: 10e18})

    const expectedBalance = 10e18
    // check balance
    const actualbalance = await buyBack.etherBalance.call(InitAccount);

    assert.equal(actualbalance, expectedBalance, "Failed to deposit ether into contract");
  })

  it("Should allow user to modify burn", async() => {
    // deposit tokens
    await deposit();

    // add buyback
    await buyBack.addBuyBack(
      tokenGNO.address, 
      etherToken.address, 
      BurnAddress,
      true, 
      [0,1], 
      [1e18,1e18], 0, true, web3.utils.toWei("1", 'ether'),
      {from: InitAccount}); 
    
    const expected = false 
    // modify burn
    const actual = await buyBack.modifyBurn(expected, {from: InitAccount});

    assert.equal(actual.logs[0].args.shouldBurnToken, expected, "Failed to modify burn")
  });

  it("Should prevent non existent user from modifying burn", async() => {
    catchRevert(
      buyBack.modifyBurn(false, {from: SellerAccount})
    );
  });

  it("Should allow to modify poke", async() => {
    // deposit tokens
    await deposit();

     // add buyback
     await buyBack.addBuyBack(
      tokenGNO.address, 
      etherToken.address, 
      BurnAddress,
      true, 
      [0,1], 
      [1e18,1e18], 0, true, web3.utils.toWei("1", 'ether'),
      {from: InitAccount}); 
    
    const tx = await buyBack.modifyExternalPoke(false, {from: InitAccount});
    assert.equal(tx.logs[0].args.allowExternalPoke, false, "failed to modify external poke");
  });

  it("Should prevent non existent user from modifying poke", async() => {
    catchRevert(
      buyBack.modifyExternalPoke(false, {from: SellerAccount})
    );
  });

  it("Should allow to modify burn address", async() => {
    // deposit tokens
    await deposit();
    
    // add buyback
    await buyBack.addBuyBack(
      tokenGNO.address, 
      etherToken.address, 
      BurnAddress,
      true, 
      [0,1], 
      [1e18,1e18], 0, true, web3.utils.toWei("1", 'ether'),
      {from: InitAccount});

    // change burn address
    await buyBack.modifyBurnAddress(SecondBurnAddress, {from: InitAccount});

    const addr = await buyBack.getBurnAddress.call();
    assert.equal(addr, SecondBurnAddress, "failed to modify burn address");
  });

  it("Should prevent non existent user from modifying burn address", async() => {
    catchRevert(
      buyBack.modifyBurnAddress(InitAccount, SecondBurnAddress, {from: SellerAccount})
    );
  });

  it("Should allow to modify auction amount", async() => {

     // add buyback
     await buyBack.addBuyBack(
      tokenGNO.address, 
      etherToken.address, 
      BurnAddress,
      true, 
      [0,1], 
      [1e18,1e18], 0, true, web3.utils.toWei("1", 'ether'),
      {from: InitAccount});
    
    // modify auction amount
    await buyBack.modifyAuctionAmount(1, 2e18, {from: InitAccount});

    const expected = 2e18

    // get auction amount
    const actual = (await buyBack.getAuctionAmount.call(1)).toNumber();

    assert.equal(expected, actual, "failed to modify auction amount");
  });

  it("Should prevent non existent user from modifying auction amount", async() => {
    catchRevert(
      buyBack.modifyAuctionAmount(1, 2e18, {from: SellerAccount})
    );
  });

  it("Should allow to modify auction amount multi", async() => {
    // add buyback
    await buyBack.addBuyBack(
      tokenGNO.address, 
      etherToken.address, 
      BurnAddress,
      true, 
      [0,1], 
      [1e18,1e18], 0, true, web3.utils.toWei("1", 'ether'),
      {from: InitAccount});
    
    await buyBack.modifyAuctionAmountMulti([1], [3e18], {from: InitAccount});

    const expected = 3e18
    const actual   = (await buyBack.getAuctionAmount.call(1)).toNumber();
    assert.equal(actual, expected, "failed to modify auction amount");
  })

  it("Should prevent non existent user from modifying auction amount", async() => {
    catchRevert(
      buyBack.modifyAuctionAmountMulti([1], [3e18], {from: SellerAccount})
    );
  });

  it("Should prevent modifying auction amount multi with invalid array", async() => {
    // add buyback
    await buyBack.addBuyBack(
      tokenGNO.address, 
      etherToken.address, 
      BurnAddress,
      true, 
      [0,1], 
      [1e18,1e18], 0, true, web3.utils.toWei("1", 'ether'),
      {from: InitAccount});

    catchRevert(
      buyBack.modifyAuctionAmountMulti([1,3], [3e18], {from: InitAccount})
    )
  })

  it("Should prevent modifying auction amount multi with non existent auction index", async() => {

    // add buyback
    await buyBack.addBuyBack(
      tokenGNO.address, 
      etherToken.address, 
      BurnAddress,
      true, 
      [0,1], 
      [1e18,1e18], 0, true, web3.utils.toWei("1", 'ether'),
      {from: InitAccount});

    catchRevert(
      buyBack.modifyAuctionAmountMulti(
        [4], 
        [3e18], 
        {from: InitAccount}
      )
    )
  
  })

  it("Should allow to modify auction index", async() => {

    // add buyback
    await buyBack.addBuyBack(
      tokenGNO.address, 
      etherToken.address, 
      BurnAddress,
      true, 
      [0,1], 
      [1e18,1e18], 0, true, web3.utils.toWei("1", 'ether'),
      {from: InitAccount});
    
    // add new auction index 
    await buyBack.modifyAuctionIndex(3, 1e18, {from: InitAccount});
    
    const expected = 3 // length of auctionIndexes [0, 1, 3]
    const indexes = (await buyBack.getAuctionIndexes({from: InitAccount}));
    assert.equal(indexes.length, expected, "Failed to modify auction indexes")
  })

  it("Should allow to modify auction index multi", async() => {
    
    // add buyback
    await buyBack.addBuyBack(
      tokenGNO.address, 
      etherToken.address, 
      BurnAddress,
      true, 
      [0,1], 
      [1e18, 1e18], 0, true, web3.utils.toWei("1", 'ether'),
      {from: InitAccount});

    await buyBack.modifyAuctionIndexMulti(
      [4, 5],
      [1e18, 1e18],
      {from: InitAccount}
    );
    
    const expected = 4 // length of auctionIndexes [0, 1, 4, 5]

    const indexes = (await buyBack.getAuctionIndexes({from: InitAccount}));    
    assert.equal(indexes.length, expected, "Failed to modify auction indexes")
  })

  it("Should prevent modify auction index multi with invalid array length", async() => {
    catchRevert(
      buyBack.modifyAuctionIndexMulti([4,5], [1e18], {from: InitAccount})
    )
  })

  it("Should allow to modify tip price", async() => {
    // add buyback
    await buyBack.addBuyBack(
      tokenGNO.address, 
      etherToken.address, 
      BurnAddress,
      true, 
      [0,1], 
      [1e18,1e18], 0, true, web3.utils.toWei("1", 'ether'),
      {from: InitAccount});

    const expected = 10000000000
    const actual = await buyBack.modifyTipAmount(expected, {from: InitAccount});

    assert.equal(actual.logs[0].args.amount, expected, "failed to modify tip price");
  })

  it("Should prevent non existent user from modifying tip price", async() => {
    catchRevert(
      buyBack.modifyTipAmount(10000000000, {from: SellerAccount})
    );
  });

  it("Should allow to modify time interval", async() => {
     // add buyback
     await buyBack.addBuyBack(
      tokenGNO.address, 
      etherToken.address, 
      BurnAddress,
      true, 
      [0,1], 
      [1e18,1e18], 0, true, web3.utils.toWei("1", 'ether'),
      {from: InitAccount});
    
    const expected = 10
    const actual = await buyBack.modifyTimeInterval(expected, {from: InitAccount});

    assert.equal(actual.logs[0].args.timeInterval, expected, "failed to modify time interval");
  })

  it("Should prevent non existent user from modifying time interval", async() => {
    catchRevert(
      buyBack.modifyTimeInterval(10, {from: SellerAccount})
    );
  });

  it("Should allow to remove auction index", async() => {
    // add buyback
    await buyBack.addBuyBack(
      tokenGNO.address, 
      etherToken.address, 
      BurnAddress,
      true, 
      [0,1], 
      [1e18,1e18], 0, true, web3.utils.toWei("1", 'ether'),
      {from: InitAccount});
    
    await buyBack.removeAuctionIndex(1, {from: InitAccount})
    const indexes = (await buyBack.getAuctionIndexes({from: InitAccount}));
    assert.equal(indexes.length, 1, "Failed to modify auction indexes")
  })

  it("Should prevent non existent from removing auction index", async() => {
    catchRevert(
      buyBack.removeAuctionIndex(4, {from: SellerAccount})
    );
  });

  it("Should allow to remove auction indexes multi", async() => {
    
    // add buyback
    await buyBack.addBuyBack(
      tokenGNO.address, 
      etherToken.address, 
      BurnAddress,
      true, 
      [0,1, 3], 
      [1e18, 1e18, 1e18], 0, true, web3.utils.toWei("1", 'ether'),
      {from: InitAccount});

    await buyBack.removeAuctionIndexMulti([0,1], {from: InitAccount})
    const indexes = (await buyBack.getAuctionIndexes({from: InitAccount}));

    assert.equal(indexes.length, 1, "Failed to modify auction indexes")
  })

  it("Should prevent modify auction index multi with empty array length", async() => {
    catchRevert(
      buyBack.removeAuctionIndexMulti(InitAccount, [], {from: InitAccount})
    )
  })

  it("Should withdraw all ether deposit", async() => {

    await buyBack.addBuyBack(
      tokenGNO.address, 
      etherToken.address, 
      BurnAddress,
      true, 
      [0, 1], 
      [1e18, 1e18], 0, true, web3.utils.toWei("1", 'ether'),
      {from: InitAccount});

    await deposit(); // deposit tokens

    await buyBack.sendTransaction({from: InitAccount, value: 10e18})

    let expectedBalance = 10e18
    // check balance
    let actualbalance = await buyBack.etherBalance.call(InitAccount);

    assert.equal(actualbalance, expectedBalance, "Failed to deposit ether into contract");

    await buyBack.withdrawEther(InitAccount, 10e18, {from: InitAccount});

    expectedBalance = 0
    actualbalance = await buyBack.etherBalance.call(InitAccount);

    assert.equal(actualbalance, expectedBalance, "Failed to withdraw ether deposit");
  })

  it("Should withdraw part of ether deposit", async() => {

    await buyBack.addBuyBack(
      tokenGNO.address, 
      etherToken.address, 
      BurnAddress,
      true, 
      [0, 1], 
      [1e18, 1e18], 0, true, web3.utils.toWei("1", 'ether'),
      {from: InitAccount});

    await deposit(); // deposit tokens

    await buyBack.sendTransaction({from: InitAccount, value: 10e18})

    let expectedBalance = 10e18
    // check balance
    let actualbalance = await buyBack.etherBalance.call(InitAccount);

    assert.equal(actualbalance, expectedBalance, "Failed to deposit ether into contract");

    await buyBack.withdrawEther(InitAccount, 5e18, {from: InitAccount});

    expectedBalance = 5e18
    actualbalance = await buyBack.etherBalance.call(InitAccount);

    assert.equal(actualbalance, expectedBalance, "Failed to withdraw ether deposit");
  })

  it("Should prevent withdraw more than ether deposit", async() => {

    await buyBack.addBuyBack(
      tokenGNO.address, 
      etherToken.address, 
      BurnAddress,
      true, 
      [0, 1], 
      [1e18, 1e18], 0, true, web3.utils.toWei("1", 'ether'),
      {from: InitAccount});

    await deposit(); // deposit tokens

    await buyBack.sendTransaction({from: InitAccount, value: 10e18})

    let expectedBalance = 10e18
    // check balance
    let actualbalance = await buyBack.etherBalance.call(InitAccount);

    assert.equal(actualbalance, expectedBalance, "Failed to deposit ether into contract");

    catchRevert(
      buyBack.withdrawEther(InitAccount, 20e18, {from: InitAccount})
    )

  })

  it("Should withdraw all the balance", async() => {

    await buyBack.addBuyBack(
      tokenGNO.address, 
      etherToken.address, 
      BurnAddress,
      true, 
      [0, 1], 
      [1e18, 1e18], 0, true, web3.utils.toWei("1", 'ether'),
      {from: InitAccount});

      await deposit(); // deposit tokens

    await buyBack.withdraw(etherToken.address, WithdrawalAddress, 40e18, {from: InitAccount})
    const balance = await buyBack.getTokenBalance(etherToken.address, {from: InitAccount});

    assert.equal(balance, 0, "Failed to withdraw tokens")
  })

  it("Should remove buyback with balance 0", async() => {

    await buyBack.addBuyBack(
      tokenGNO.address, 
      etherToken.address, 
      BurnAddress,
      true, 
      [0, 1], 
      [1e18, 1e18], 0, true, web3.utils.toWei("1", 'ether'),
      {from: InitAccount});

      await deposit(); // deposit tokens
    
    await buyBack.withdraw(etherToken.address, WithdrawalAddress, 40e18, {from: InitAccount})

    const tx = await buyBack.removeBuyBack({from: InitAccount})
    const actual = tx.logs[0].args.auctionIndexes.map(item => item.toNumber())

    assert.deepEqual(actual, [0, 1], "Failed to remove buyback")

  })

  it("Should prevent removing buyback with balance not 0", async() => {

    await buyBack.addBuyBack(
      tokenGNO.address, 
      etherToken.address, 
      BurnAddress,
      true, 
      [0, 1], 
      [1e18, 1e18], 0, true, web3.utils.toWei("1", 'ether'),
      {from: InitAccount});
    await deposit(); // deposit tokens
      
    catchRevert(
      buyBack.removeBuyBack(InitAccount, {from: InitAccount})
    )
  })

  it("Should prevent non existent user from removing buyback", async() => {
    catchRevert(
      buyBack.removeBuyBack({from: SellerAccount})
    );
  });

  it("Should allow to pariticipate in dutchx auction, claim funds & burn it to an address", async() => {

    const currentBal = (await tokenGNO.balanceOf.call(BurnAddress)).toNumber()
    // add buyback
    await buyBack.addBuyBack( 
      tokenGNO.address, 
      etherToken.address, 
      BurnAddress, 
      true, [0], 
      [1e18], 0, true, web3.utils.toWei("1", 'ether'),
      {from: InitAccount}); 
    
    await deposit(); //deposit tokens

    await performAuctionAndClaim();

    // check burn address for balance
    const burnBalance = (await tokenGNO.balanceOf.call(BurnAddress)).toNumber()

    assert.equal(burnBalance > currentBal, true, "Failed to burn withdrawn tokens");

  })

  it("Should be able to claim funds and burn it without address", async() => {
    // add buyback
    await buyBack.addBuyBack( 
      tokenGNO.address, 
      etherToken.address, 
      BurnAddress, 
      true, [0], 
      [1e18], 0, true, web3.utils.toWei("0.000001", 'ether'),
      {from: InitAccount});     // deposit tokens
    await deposit();
    await performAuctionAndClaim();
  })

  it("Should prevent calling postSellOrder if user doesn't have enough balance", async() => {
    // add buyback
    await buyBack.addBuyBack( 
      tokenGNO.address, 
      etherToken.address, 
      BurnAddress, 
      true, [0], 
      [100e18], 0, false, web3.utils.toWei("0.01", 'ether'),
      {from: InitAccount}); 

    // deposit tokens
    await deposit();

    await approveAndDepositTradingAmounts();

    await catchRevert(
      buyBack.postSellOrder(InitAccount, {from: SellerAccount})
    )  
  })

  it("Should prevent calling postSellOrder if external poke is false", async() => {
    // add buyback
    await buyBack.addBuyBack( 
      tokenGNO.address, 
      etherToken.address, 
      BurnAddress, 
      true, [0], 
      [1e18], 0, false, web3.utils.toWei("0.01", 'ether'),
      {from: InitAccount}); 

    // deposit tokens
    await deposit();

    await approveAndDepositTradingAmounts();

    await catchRevert(
      buyBack.postSellOrder(InitAccount, {from: SellerAccount})
    )  
  })

  it("Should prevent being able to call postSellOrder if time period hasn't passed", async() => {

    // add buyback
    await buyBack.addBuyBack( 
      tokenGNO.address, 
      etherToken.address, 
      BurnAddress, 
      true, [0], 
      [1e18], 0, true, web3.utils.toWei("0.01", 'ether'),
      {from: InitAccount}); 
    // deposit tokens
    await deposit();

    await approveAndDepositTradingAmounts();
    // sellorder 1
    await buyBack.postSellOrder(InitAccount, {from: InitAccount});
    // sellorder 2
    await catchRevert(
      buyBack.postSellOrder(InitAccount, {from: InitAccount})
    )
  })

  it("Should be able to postSellOrder after timeinterval has elapsed & previous order has been claimed", async() => {
    let wait = 10;

    // add buyback
    await buyBack.addBuyBack( 
      tokenGNO.address, 
      etherToken.address, 
      BurnAddress, 
      true, [0], 
      [1e18], 0, true, web3.utils.toWei("0.01", 'ether'),
      {from: InitAccount});

    await deposit(); // deposit tokens
    
    await approveAndDepositTradingAmounts();

    const bal = (await buyBack.getSellTokenBalance({from: InitAccount})).toNumber()
    assert.equal(bal, 40e18, "Failed to deposit tokens")
    
    await buyBack.postSellOrder(InitAccount, {from: InitAccount});
    
    await tradeGNOETH();

    await buyBack.claim(InitAccount, {from: InitAccount});

    await increaseTime(wait)

    await buyBack.postSellOrder(InitAccount, {from: InitAccount});

  });

  it("Should prevent posting a new sell order if previous sell order hasn't been claimed", async() => {
    let wait = 10;

    // add buyback
    await buyBack.addBuyBack( 
      tokenGNO.address, 
      etherToken.address, 
      BurnAddress, 
      true, [0], 
      [1e18], 0, true, web3.utils.toWei("0.01", 'ether'),
      {from: InitAccount});     

    // deposit tokens
    await deposit();
    
    await approveAndDepositTradingAmounts();

    const bal = (await buyBack.getSellTokenBalance.call( {from: InitAccount})).toNumber()
    assert.equal(bal, 40e18, "Failed to deposit tokens")
    
    await buyBack.postSellOrder(InitAccount, {from: InitAccount});    
    await tradeGNOETH();

    await increaseTime(wait)

    catchRevert(
      buyBack.postSellOrder(InitAccount, {from: InitAccount})
    )
  });

})