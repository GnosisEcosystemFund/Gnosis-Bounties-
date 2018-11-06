const Buyback = artifacts.require("Buyback");
const DutchExchangeProxy = artifacts.require("DutchExchangeProxy")
const EtherToken = artifacts.require("EtherToken")
const GNOToken = artifacts.require("TokenGNO")


module.exports = function(deployer, network, accounts) {
    const BurnAddress = accounts[2]

    let dxProxy, etherToken, gnoToken
    console.log("working on deploying")

    return deployer.then(() => {
      dxProxy = DutchExchangeProxy.deployed()
      console.log('dxproxy', dxProxy.address)
    }).then(() =>{
      etherToken = EtherToken.deployed()
    }).then(() => {
      gnoToken = GNOToken.deployed()
    }).then(() => {
      console.log('faking it')
      deployer.deploy(Buyback, dxProxy.address, gnoToken.address, etherToken.address, BurnAddress, true, [1,2,3], [1e18, 1e18, 1e18]).then(()=>{})
    })

}