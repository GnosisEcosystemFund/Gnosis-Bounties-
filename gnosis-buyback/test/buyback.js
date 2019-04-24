const Buyback = artifacts.require("Buyback")
const TokenGNO = artifacts.require('TokenGNO')
const EtherToken = artifacts.require("EtherToken")
const DutchExchange = artifacts.require("DutchExchange")


const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545")) // Hardcoded development port
const {
  waitUntilPriceIsXPercentOfPreviousPrice,
  getAuctionIndex,
  takeSnapshot,
  revertToSnapshot,
  catchRevert,
} = require('./util')

contract('Buyback', (accounts) => {
  
  const toWei = ( number ) => web3.utils.toWei(number.toString(), 'ether')

  const deposit = async () => {
    await etherToken.deposit({from: InitAccount, value: toWei(100) })

    await etherToken.transfer(SellerAccount, toWei(20), {from: InitAccount})
    await tokenGNO.transfer(SellerAccount, toWei(20), {from: InitAccount})

    // approve the buy back contract address to withdraw 40e18 tokens from etherToken
    await etherToken.approve(BuyBackAccount, toWei(40), {from: InitAccount})

    // deposits ethertoken
    await buyBack.depositSellToken(toWei(40), etherToken.address, {from: InitAccount})

    const balance = await buyBack.balances.call(InitAccount, etherToken.address)
    assert.ok(balance.gt(0),"failed to deposit")

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
    await tokenGNO.approve(dx.address, toWei(10), {from: SellerAccount})
    await etherToken.approve(dx.address, toWei(10), {from: SellerAccount})

    await dx.deposit(tokenGNO.address, toWei(10), {from: SellerAccount});
    await dx.deposit(etherToken.address, toWei(10), {from: SellerAccount});

    await dx.addTokenPair(etherToken.address, tokenGNO.address, toWei(2), 0, 2, 1, {from: SellerAccount})   
  }

  const performAuction = async(buybackId) => {
    await approveAndDepositTradingAmounts();

    const auctionIndex = (await dx.getAuctionIndex.call(etherToken.address, tokenGNO.address)).toNumber();
    assert.equal(auctionIndex, 1, "Failed to create auction");
    
    await buyBack.postSellOrder(buybackId, {from: InitAccount});

    await waitUntilPriceIsXPercentOfPreviousPrice(dx, etherToken, tokenGNO, 1)
    await dx.postBuyOrder(etherToken.address, tokenGNO.address, 1, toWei(10),  {from: SellerAccount})

    const auctionWasClosed = (auctionIndex + 1 === (await getAuctionIndex(dx, tokenGNO, etherToken)))
    assert.equal(auctionWasClosed, true, "Failed to close auction error")

  }

  const createBuyBack = async () => {

    // deposit tokens
    await deposit();

    // send ether for tips
    await buyBack.sendTransaction({from: InitAccount, value: toWei(10)})

    // check balance
    const actualbalance = await buyBack.etherBalance.call(InitAccount);
    assert.equal(actualbalance.gt(0), true, "Failed to deposit ether into contract");

    // create buyback
    const tx = await buyBack.addBuyBack(
                        tokenGNO.address, 
                        etherToken.address, 
                        BurnAddress,
                        true, 
                        1, 
                        toWei(1),
                        toWei(0.01),
                        {from: InitAccount}); 
    return tx.logs[0].args

  }

  let buyBack, 
      InitAccount, 
      BuyBackAccount ,
      etherToken, 
      dx, 
      tokenGNO, 
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

    dx = await DutchExchange.at(dxAddress)
    
    tokenGNO   = await TokenGNO.deployed()
    etherToken = await EtherToken.deployed()
    // owlProxy   = await TokenOWLProxy.deployed()
    // tokenFRT   =  await TokenFRT.deployed();
    // priceOracleInterface = await PriceOracleInterface.deployed()
    
    console.log(`
      dx: ${dxAddress}
      buyBack: ${buyBack.address}
    `)

    // takeSnapshot
    snapId = await takeSnapshot();
  })

  afterEach('revert the blockchain snapshot', async function () {
    await revertToSnapshot(snapId) // revert to the snapshot
    snapId = await takeSnapshot();
  })

  it("Should prevent adding buyback without enough deposit", async() => {
      await catchRevert(
        buyBack.addBuyBack(
          tokenGNO.address, 
          etherToken.address, 
          BurnAddress,
          true, 
          1, 
          toWei("1"), 
          toWei("0.1"),
          {from: InitAccount}
        ),
        "revert user does not have enough deposit to create buyback "
      )
  })

  it("Should deposit tokens", async() => {
    // deposit tokens
    await deposit();
  })

  it("Should add buyback with enough deposit", async() => {
    const { userAddress } = await createBuyBack()
    assert.equal(userAddress, InitAccount, "failed to add buyback");

    // check balance
    const expectedBalance = 10e18.toString()
    const actualbalance = await buyBack.etherBalance.call(InitAccount);
    assert.equal(actualbalance.toString(), expectedBalance, "Failed to deposit ether into contract");

  })

  it("Should prevent withdraw more than ether deposit", async() => {
    await createBuyBack()
    let expectedBalance = 10e18
    // check balance
    let actualbalance = await buyBack.etherBalance.call(InitAccount);

    assert.equal(actualbalance, expectedBalance, "Failed to deposit ether into contract");

    catchRevert(
      buyBack.withdrawEther(InitAccount, toWei(20), {from: InitAccount}),
      "revert user balance is less than available withdrawal amount"
    )
  })


  it("Should allow to pariticipate in dutchx auction, claim funds & burn it to an address", async() => {
    const currentBal = (await tokenGNO.balanceOf.call(BurnAddress))
 
    // add buyback
    const { buybackId } = await createBuyBack()
    await performAuction(buybackId);

    await buyBack.claim(buybackId, {from: InitAccount});

    // check burn address for balance
    const burnBalance = (await tokenGNO.balanceOf.call(BurnAddress))

    assert.equal(burnBalance.gt(currentBal), true, "Failed to burn withdrawn tokens");

  })


  it(`Should pariticipate in dutchx auction be able to 
      claim funds and burn it to an address and prevent 
      releasingFunds of the executed buyback`, async() => {
        
    // add buyback
    const { buybackId } = await createBuyBack()

    // dx auction
    await performAuction(buybackId);

    await buyBack.claim(buybackId, {from: InitAccount});

    await catchRevert(
      buyBack.releaseBuyBackFund(buybackId, {from: InitAccount}),
      "revert can only release funds of unexecuted buyback"
    )

  })


  it("Should allow releasing unexecuted buyback funds and withdrawing it", async() => {
    const { buybackId } = await createBuyBack()
    const { buybackId: buybackId2 } = await createBuyBack()

    console.log({ buybackId: buybackId.toString()})
    console.log({ buybackId2: buybackId2.toString()})

     // dx auction
    await performAuction(buybackId);

    await buyBack.claim(buybackId, {from: InitAccount});

    // get current auction index
    const auctionIndex = (await dx.getAuctionIndex.call(etherToken.address, tokenGNO.address)).toNumber();
    assert.equal(auctionIndex, 2, "Failed to create auction");

    // should release funds for auction index buybackid2 with auction index 1
    const releaseTx = await buyBack.releaseBuyBackFund(
      buybackId2, {from: InitAccount})
    const { totalAmountReleased } = releaseTx.logs[0].args

    const expectedTotalAmountReleased = toWei(1)
    assert.equal(totalAmountReleased.toString(), expectedTotalAmountReleased.toString(), "should release the total amount")

    // should be able to withdraw the 79 ethertken
    await buyBack.withdraw(etherToken.address, WithdrawalAddress, toWei(79), {from: InitAccount})
    const balance = await buyBack.balances.call(InitAccount, etherToken.address);
    assert.equal(balance, toWei(0), "Failed to withdraw tokens")

  })

  it("Should part of account balance", async() => {
    await deposit(); // deposit tokens

    await buyBack.withdraw(etherToken.address, WithdrawalAddress, toWei(30), {from: InitAccount})

    const balance = await buyBack.balances.call(InitAccount, etherToken.address);

    assert.equal(balance, toWei(10), "Failed to withdraw tokens")

  })

  it("Should prevent withdrawing amount affecting buyback", async() => {
    await createBuyBack()

    await catchRevert(
      buyBack.withdraw(etherToken.address, WithdrawalAddress, toWei(100), {from: InitAccount}),
      "revert amount exceeds available balance"
    )

  })

  it("Should prevent non existent user from releasing buyback fund", async() => {
    const { buybackId } =  await createBuyBack();

    await catchRevert(
      buyBack.releaseBuyBackFund(buybackId, {from: InitAccount}),
      "rever can not release unexpired buyback funds"
    );
  })


})