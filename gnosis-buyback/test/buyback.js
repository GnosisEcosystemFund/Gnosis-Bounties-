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
    await buyBack.depositSellToken(InitAccount, 40e18, {from: InitAccount})

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

    await buyBack.claim(InitAccount, {from: InitAccount});
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

    // takeSnapshot
    snapId = await takeSnapshot();
  })


  it("Should add buyback", async() => {
    const tx = await buyBack.addBuyBack(
                        InitAccount,  
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
    await buyBack.sendTransaction({from: InitAccount, value: 10e18})
    const balance = await buyBack.getEtherBalance.call(InitAccount);
    assert.equal(balance, 10e18, "Failed to deposit ether into contract");
  })

  it("Should allow owner to disable burn", async() => {
    await buyBack.modifyBurn(InitAccount, false, {from: InitAccount});
  });

  it("Should prevent non owner from modifying burn", async() => {
    catchRevert(
      buyBack.modifyBurn(InitAccount, false, {from: SellerAccount})
    );
  });

  it("Should allow to modify poke", async() => {
    const tx = await buyBack.modifyExternalPoke(InitAccount, false, {from: InitAccount});
    assert.equal(tx.logs[0].args.allowExternalPoke, false, "failed to modify external poke");
  });

  it("Should prevent non owner from modifying poke", async() => {
    catchRevert(
      buyBack.modifyExternalPoke(InitAccount, false, {from: SellerAccount})
    );
  });

  it("Should allow to modify burn address", async() => {
    await buyBack.modifyBurnAddress(InitAccount, SecondBurnAddress, {from: InitAccount});
    const addr = await buyBack.getBurnAddress.call(InitAccount);
    assert.equal(addr, SecondBurnAddress, "failed to modify burn address");
  });

  it("Should prevent non owner from modifying burn address", async() => {
    catchRevert(
      buyBack.modifyBurnAddress(InitAccount, SecondBurnAddress, {from: SellerAccount})
    );
  });

  it("Should allow to modify auction amount", async() => {
    await buyBack.modifyAuctionAmount(InitAccount, 1, 2e18, {from: InitAccount});
    const newBal = (await buyBack.getAuctionAmount.call(InitAccount, 1)).toNumber();
    assert.equal(2e18, newBal, "failed to modify auction amount");
  });

  it("Should prevent non owner from modifying auction amount", async() => {
    catchRevert(
      buyBack.modifyAuctionAmount(InitAccount, 1, 2e18, {from: SellerAccount})
    );
  });

  it("Should allow to modify auction amount multi", async() => {
    await buyBack.modifyAuctionAmountMulti(InitAccount, [1], [3e18], {from: InitAccount});
    const newBal = (await buyBack.getAuctionAmount.call(InitAccount, 1)).toNumber();
    assert.equal(3e18, newBal, "failed to modify auction amount");
  })

  it("Should prevent non owner from modifying auction amount", async() => {
    catchRevert(
      buyBack.modifyAuctionAmountMulti(InitAccount, [1], [3e18], {from: SellerAccount})
    );
  });

  it("Should prevent modifying auction multi with invalid array", async() => {
    catchRevert(
      buyBack.modifyAuctionAmountMulti(InitAccount, [1,3], [3e18], {from: InitAccount})
    )
  })

  it("Should prevent modifying auction multi with non existent auction index", async() => {
    catchRevert(
      buyBack.modifyAuctionAmountMulti(InitAccount, [5], [3e18], {from: InitAccount})
    )
  })

  it("Should allow to modify auction index", async() => {
    await buyBack.modifyAuctionIndex(InitAccount, 3, 1e18, {from: InitAccount});
    // (address _userAddress, uint _auctionIndex, uint _auctionAmount)
    const indexes = (await buyBack.getAuctionIndexes.call(InitAccount));
    assert.equal(indexes.length, 3, "Failed to modify auction indexes")
  })

  it("Should allow to modify auction index multi", async() => {
    await buyBack.modifyAuctionIndexMulti(InitAccount, [4, 5], [1e18, 1e18], {from: InitAccount});
    // (address _userAddress, uint _auctionIndex, uint _auctionAmount)
    const indexes = (await buyBack.getAuctionIndexes.call(InitAccount));
    assert.equal(indexes.length, 5, "Failed to modify auction indexes")
  })

  it("Should prevent modify auction index multi with invalid array length", async() => {
    catchRevert(
      buyBack.modifyAuctionIndexMulti(InitAccount, [4,5], [1e18], {from: InitAccount})
    )
  })

  it("Should prevent non owner from modifying sell token", async() => {
    catchRevert(
      buyBack.modifySellToken(InitAccount, etherToken.address, {from: SellerAccount})
    );
  });

  it("Should allow to modify sell token", async() => {
    await buyBack.modifySellToken(InitAccount, etherToken.address, {from: InitAccount});
  })

  it("Should prevent non owner from modifying tip price", async() => {
    catchRevert(
      buyBack.modifyTip(InitAccount, 10000000000, {from: SellerAccount})
    );
  });

  it("Should allow to modify tip price", async() => {
    const tx = await buyBack.modifyTip(InitAccount, 10000000000, {from: InitAccount});
    assert.equal(tx.logs[0].args.amount, 10000000000, "failed to modify tip price");
  })

  it("Should prevent non owner from modifying buy token", async() => {
    catchRevert(
      buyBack.modifyBuyToken(InitAccount, tokenGNO.address, {from: SellerAccount})
    );
  });

  it("Should allow owner to modify buy token", async() => {
    const tx = await buyBack.modifyBuyToken(InitAccount, tokenGNO.address, {from: InitAccount});
    assert.equal(tx.logs[0].args.tokenAddress, tokenGNO.address, "failed to modify buy token");
  })

  it("Should prevent non owner from modifying time interval", async() => {
    catchRevert(
      buyBack.modifyTimeInterval(InitAccount, 10, {from: SellerAccount})
    );
  });
  
  it("Should allow to modify time interval", async() => {
    const tx = await buyBack.modifyTimeInterval(InitAccount, 10, {from: InitAccount});
    assert.equal(tx.logs[0].args.timeInterval, 10, "failed to time interval");
  })

  it("Should prevent non owner from removing auction index", async() => {
    catchRevert(
      buyBack.removeAuctionIndex(InitAccount, 4, {from: SellerAccount})
    );
  });
  
  it("Should allow to remove auction index", async() => {
    await buyBack.removeAuctionIndex(InitAccount, 4, {from: InitAccount})
    const indexes = (await buyBack.getAuctionIndexes.call(InitAccount));
    assert.equal(indexes.length, 4, "Failed to modify auction indexes")

  })

  it("Should allow to remove auction indexes multi", async() => {
    await buyBack.removeAuctionIndexMulti(InitAccount, [0,1], {from: InitAccount})
    const indexes = (await buyBack.getAuctionIndexes.call(InitAccount));
    assert.equal(indexes.length, 2, "Failed to modify auction indexes")
  })

  it("Should prevent modify auction index multi with empty array length", async() => {
    catchRevert(
      buyBack.removeAuctionIndexMulti(InitAccount, [], {from: InitAccount})
    )
  })

  it("Should deposit tokens", async() => {
    await deposit();
  })

  it("Should prevent removing buyback with balance not 0", async() => {
    catchRevert(
      buyBack.removeBuyBack(InitAccount, {from: InitAccount})
    )
  })

  it("Should withdraw all the balance", async() => {
    await buyBack.withdraw(InitAccount, etherToken.address, WithdrawalAddress, 40e18, {from: InitAccount})
    const balance = await buyBack.getTokenBalance.call( InitAccount, etherToken.address);
    assert.equal(balance, 0, "Failed to withdraw tokens")
  })

  it("Should prevent non owner from removing buyback", async() => {
    catchRevert(
      buyBack.removeBuyBack(InitAccount, {from: SellerAccount})
    );
  });

  it("Should remove buyback with balance 0", async() => {
      await buyBack.removeBuyBack(InitAccount, {from: InitAccount})
  })

  it("Should allow to pariticipate in dutchx auction, claim funds & burn it to an address", async() => {
    await revertToSnapshot(snapId) // revert to the snapshot
    snapId = await takeSnapshot();

    const currentBal = (await tokenGNO.balanceOf.call(BurnAddress)).toNumber()

    // add buyback
    await buyBack.addBuyBack(InitAccount, 
                            tokenGNO.address, 
                            etherToken.address, 
                            BurnAddress, 
                            true, [0], 
                            [1e18], 0, true, web3.utils.toWei("1", 'ether'),
                            {from: InitAccount}); 
    // deposit tokens
    await deposit();
    await performAuctionAndClaim();

    // check burn address for balance
    const burnBalance = (await tokenGNO.balanceOf.call(BurnAddress)).toNumber()
    assert.equal(burnBalance > currentBal, true, "Failed to burn withdrawn tokens");
  })

  it("Should be able to claim funds and burn it without address", async() => {
    await revertToSnapshot(snapId) // revert to the snapshot
    snapId = await takeSnapshot();

    // add buyback
    await buyBack.addBuyBack(InitAccount, 
      tokenGNO.address, 
      etherToken.address, 
      BurnAddress, 
      true, [0], 
      [1e18], 0, true, web3.utils.toWei("0.000001", 'ether'),
      {from: InitAccount});     // deposit tokens
    await deposit();
    await performAuctionAndClaim();
  })

  it("Should prevent calling postSellOrder if external poke is false", async() => {
    await revertToSnapshot(snapId) // revert to the snapshot
    snapId = await takeSnapshot();

    // add buyback
    await buyBack.addBuyBack(InitAccount, 
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
    await revertToSnapshot(snapId) // revert to the snapshot
    snapId = await takeSnapshot();

    // add buyback
    await buyBack.addBuyBack(InitAccount, 
      tokenGNO.address, 
      etherToken.address, 
      BurnAddress, 
      true, [0], 
      [1e18], 0, true, web3.utils.toWei("0.01", 'ether'),
      {from: InitAccount}); 
    // deposit tokens
    await deposit();

    await approveAndDepositTradingAmounts();
    await buyBack.postSellOrder(InitAccount, {from: InitAccount});

    await catchRevert(
      buyBack.postSellOrder(InitAccount, {from: InitAccount})
    )
  })

  it("Should be able to postSellOrder after timeinterval has elapsed & previous order has been claimed", async() => {
    await revertToSnapshot(snapId) // revert to the snapshot
    snapId = await takeSnapshot();

    let wait = 10;

    // add buyback
    await buyBack.addBuyBack(InitAccount, 
      tokenGNO.address, 
      etherToken.address, 
      BurnAddress, 
      true, [0], 
      [1e18], 0, true, web3.utils.toWei("0.01", 'ether'),
      {from: InitAccount});     // deposit tokens
    await deposit();
    
    await approveAndDepositTradingAmounts();

    const bal = (await buyBack.getSellTokenBalance.call(InitAccount, {from: InitAccount})).toNumber()
    assert.equal(bal, 40e18, "Failed to deposit tokens")
    
    await buyBack.postSellOrder(InitAccount, {from: InitAccount});
    
    await tradeGNOETH();

    await buyBack.claim(InitAccount, {from: InitAccount});

    await increaseTime(wait)

    await buyBack.postSellOrder(InitAccount, {from: InitAccount});

  });

  it("Should prevent posting a new sell order if previous sell order hasn't been claimed", async() => {
    await revertToSnapshot(snapId) // revert to the snapshot
    snapId = await takeSnapshot();

    let wait = 10;

    // add buyback
    await buyBack.addBuyBack(InitAccount, 
                    tokenGNO.address, 
                    etherToken.address, 
                    BurnAddress, 
                    true, [0], 
                    [1e18], 0, true, web3.utils.toWei("0.01", 'ether'),
                    {from: InitAccount});     

    // deposit tokens
    await deposit();
    
    await approveAndDepositTradingAmounts();

    const bal = (await buyBack.getSellTokenBalance.call(InitAccount, {from: InitAccount})).toNumber()
    assert.equal(bal, 40e18, "Failed to deposit tokens")
    
    await buyBack.postSellOrder(InitAccount, {from: InitAccount});    
    await tradeGNOETH();

    await increaseTime(wait)

    catchRevert(
      buyBack.postSellOrder(InitAccount, {from: InitAccount})
    )
  });

})