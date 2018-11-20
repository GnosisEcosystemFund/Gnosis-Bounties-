const Buyback = artifacts.require("Buyback");
const DutchExchangeProxy = artifacts.require("DutchExchangeProxy")
const EtherToken = artifacts.require("EtherToken")
const GNOToken = artifacts.require("TokenGNO")


module.exports = function(deployer, network, accounts) {

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
      return deployer
        .deploy(
          Buyback,
          dxProxy.address,
        )
    }).then(async () => {
      const buyback = await Buyback.deployed()
      console.log('buyBack deployed with address: ', buyback.address)
    })

}