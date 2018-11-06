module.exports = {
    norpc: true,
    port: 8545,
    copyPackages: ['@gnosis.pm'],
    testCommand: 'node ../node_modules/.bin/truffle test test/buyback.js  --network coverage',
    deepSkip: true,
    skipFiles: ['external', 'flat', 'helpers', 'mocks', 'oracles', 'storage'],
    forceParse: ['mocks', 'oracles']
};