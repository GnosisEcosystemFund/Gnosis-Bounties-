const Buyback = artifacts.require("Buyback");
const DutchExchangeProxy = artifacts.require("DutchExchangeProxy")
const EtherToken = artifacts.require("EtherToken")
const GNOToken = artifacts.require("TokenGNO")


module.exports = function(deployer, network, accounts) {
    const BurnAddress = accounts[2]

    let dxProxy, etherToken, gnoToken
    console.log("working on deploying")

    return deployer.then(async () => {
      dxProxy = await DutchExchangeProxy.deployed()
      console.log('dxproxy', dxProxy.address)
    }).then(async () => {
      etherToken = await EtherToken.deployed()
    }).then(async () => {
      gnoToken = await GNOToken.deployed()
    }).then(async () => {
      console.log('faking it')
      return deployer
        .deploy(
          Buyback,
          dxProxy.address,
          gnoToken.address,
          etherToken.address,
          BurnAddress,
          true,
          [1,2,3],
          [1e18, 1e18, 1e18]
        )
    }).then(async () => {
      const buyback = await Buyback.deployed()
      console.log('buyBack deployed with address: ', buyback.address)
    })

}