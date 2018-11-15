const Web3 = require('web3');
Web3.providers.HttpProvider.prototype.sendAsync = Web3.providers.HttpProvider.prototype.send
const web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545")) // Hardcoded development port

const { wait } = require('@digix/tempo')(web3)

let silent = false

function increaseTime(duration) {
    const id = Date.now();

    return new Promise((resolve, reject) => {
        web3.currentProvider.sendAsync(
            {
                jsonrpc: "2.0",
                method: "evm_increaseTime",
                params: [duration],
                id: id
            },
            err1 => {
                if (err1) return reject(err1);

                web3.currentProvider.sendAsync(
                    {
                        jsonrpc: "2.0",
                        method: "evm_mine",
                        id: id + 1
                    },
                    (err2, res) => {
                        return err2 ? reject(err2) : resolve(res);
                    }
                );
            }
        );
    });
}

/**
 * waitUntilPriceIsXPercentOfPreviousPrice
 * @param {address} ST  => Sell Token
 * @param {address} BT  => Buy Token
 * @param {unit}    p   => percentage of the previous price
 */

const timestamp = async (block = 'latest') => (await web3.eth.getBlock('latest')).timestamp

const waitUntilPriceIsXPercentOfPreviousPrice = async (dx, ST, BT, p) => {
    // const { DutchExchange: dx } = await getContracts()
    const [ getAuctionIndex, getAuctionStart ] = await Promise.all([
      dx.getAuctionIndex.call(ST.address, BT.address),
      dx.getAuctionStart.call(ST.address, BT.address)
    ])
  
    const currentIndex = getAuctionIndex.toNumber()
    const startingTimeOfAuction = getAuctionStart.toNumber()
    console.log({startingTimeOfAuction})
    let priceBefore = 1
    if (!silent) {
      let [num, den] = (await dx.getCurrentAuctionPrice.call(ST.address, BT.address, currentIndex))
      priceBefore = num.div(den)
      console.log(`
        Price BEFORE waiting until Price = initial Closing Price (2) * 2
        ==============================
        Price.num             = ${num.toNumber()}
        Price.den             = ${den.toNumber()}
        Price at this moment  = ${(priceBefore)}
        ==============================
      `)
    }
  
    const timeToWaitFor = Math.ceil((86400 - p * 43200) / (1 + p)) + startingTimeOfAuction
    console.log({timeToWaitFor})
    // wait until the price is good
    // let 
    console.log(await timestamp())
    console.log(timeToWaitFor - await timestamp())
    await increaseTime(timeToWaitFor - await timestamp());
    console.log(await timestamp())

  
    if (!silent) {
      ([num, den] = (await dx.getCurrentAuctionPrice.call(ST.address, BT.address, currentIndex)))
      const priceAfter = num.div(den)
      console.log(`
        Price AFTER waiting until Price = ${p * 100}% of ${priceBefore / 2} (initial Closing Price)
        ==============================
        Price.num             = ${num.toNumber()}
        Price.den             = ${den.toNumber()}
        Price at this moment  = ${(priceAfter)}
        ==============================
      `)
    }
    assert.equal(await timestamp() >= timeToWaitFor, true)
    // assert.isAtLeast(priceAfter, (priceBefore / 2) * p)
  }

  const getAuctionIndex = async (dx, sell, buy) => {
    // const { DutchExchange: dx, EtherToken: eth, TokenGNO: gno } = await getContracts()
    // sell = sell || eth; buy = buy || gno
  
    return (await dx.getAuctionIndex.call(buy.address, sell.address)).toNumber()
  }


  function takeSnapshot() {
    return new Promise((resolve, reject) => {
        web3.currentProvider.sendAsync(
            {
                jsonrpc: "2.0",
                method: "evm_snapshot",
                params: [],
                id: new Date().getTime()
            },
            (err, result) => {
                if (err) {
                    return reject(err);
                }

                resolve(result.result);
            }
        );
    });
}

function revertToSnapshot(snapShotId) {
    console.log("reverting")
    return new Promise((resolve, reject) => {
        web3.currentProvider.sendAsync(
            {
                jsonrpc: "2.0",
                method: "evm_revert",
                params: [snapShotId],
                id: new Date().getTime()
            },
            err => {
                if (err) {
                    return reject(err);
                }

                resolve();
            }
        );
    });
}

const PREFIX = "VM Exception while processing transaction: ";
const PREFIX2 = "Returned error: VM Exception while processing transaction: ";

async function tryCatch(promise, message) {
    try {
        await promise;
        throw null;
    } catch (error) {
        assert(error, "Expected an error but did not get one");
        try {
            assert(
                error.message.startsWith(PREFIX + message),
                "Expected an error starting with '" + PREFIX + message + "' but got '" + error.message + "' instead"
            );
        } catch (err) {
            assert(
                error.message.startsWith(PREFIX2 + message),
                "Expected an error starting with '" + PREFIX + message + "' but got '" + error.message + "' instead"
            );
        }
    }
}

module.exports = {
    waitUntilPriceIsXPercentOfPreviousPrice,
    getAuctionIndex,
    takeSnapshot,
    revertToSnapshot,
    catchRevert: async function(promise) {
        await tryCatch(promise, "revert");
    }
}