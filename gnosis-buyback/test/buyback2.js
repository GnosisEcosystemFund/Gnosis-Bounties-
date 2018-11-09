const Buyback = artifacts.require("Buyback")
const DutchExchange = artifacts.require("DutchExchange")

contract('Buyback', (accounts) => {
  
  it("should do bla", async () => {
    const buyBack = await Buyback.deployed()
    const dxAddress = await buyBack.dx.call()

    const dx = DutchExchange.at(dxAddress)
    const ethUsdPrice = await dx.ethUSDOracle.call()
    console.log(`
dx: ${dxAddress}
buyBack: ${buyBack.address}
ethUsdPrice: ${ethUsdPrice}
    `)
  })
})