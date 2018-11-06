const migrateDx = require('@gnosis.pm/dx-contracts/src/migrations')

module.exports = function (deployer, network, accounts) {
    console.log({network})
  return migrateDx({
    artifacts,
    deployer,
    network,
    accounts,
    web3,
    thresholdNewTokenPairUsd: 1,
    thresholdAuctionStartUsd: 0
  })
}