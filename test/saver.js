
const { expectEvent, singletons, constants, BN, expectRevert } = require('@openzeppelin/test-helpers');

const VenusAdaptor = artifacts.require('VenusAdaptor');
const cDAIMock = artifacts.require('cDAIMock');
const WhitePaperMock = artifacts.require('WhitePaperMock');

const AlpacaAdaptor = artifacts.require('AlpacaAdaptor');
const AdaptorRouter = artifacts.require("AdaptorRouter");
const iDAIMock = artifacts.require('iDAIMock');
const TripleSlopeModel = artifacts.require('TripleSlopeModel');
const iDAIConfigMock = artifacts.require('iDAIConfigMock');
const DAIMock = artifacts.require('DAIMock');
const Saver = artifacts.require('Saver');
const Rebalancer = artifacts.require('Rebalancer');
const BNify = n => new BN(String(n));

contract('Saver', function ([_, creator, nonOwner, someone, foo]) {

  beforeEach(async function() {

    this.one = new BN('1000000000000000000');
    this.oneCToken = new BN('100000000'); // 8 decimals

    this.DAIMock = await DAIMock.new({from: creator});
    this.adaptorRouter = await AdaptorRouter.new({ from: creator})
    this.saver = await Saver.new({ from: creator });

    this.TripleSlopeModel = await TripleSlopeModel.new({from: creator});
    this.iDAIConfigMock = await iDAIConfigMock.new(
      this.TripleSlopeModel.address,
      { from: creator }
    );
    this.iDAIMock = await iDAIMock.new(
      this.DAIMock.address, 
      creator, 
      this.iDAIConfigMock.address, 
      {from: creator}
    );

    this.alpacaAdaptor = await AlpacaAdaptor.new(
      this.adaptorRouter.address, 
      this.saver.address,
      { from: creator }
    )

    // venus 
    this.WhitePaperMock = await WhitePaperMock.new({from: creator});
    this.cDAIMock = await cDAIMock.new(
      this.DAIMock.address, 
      creator, 
      this.WhitePaperMock.address, 
      {from: creator}
    );

    this.venusAdaptor = await VenusAdaptor.new(
      this.adaptorRouter.address, 
      this.saver.address,
      { from: creator }
    )

    this.Rebalancer = await Rebalancer.new(
      this.venusAdaptor.address,
      this.alpacaAdaptor.address,
      someone,
      { from: creator }
    );

    await this.Rebalancer.setSaver(this.saver.address, { from: creator });

    await this.adaptorRouter.addPair(
      this.DAIMock.address, 
      'AlpacaAdaptor',
      this.iDAIMock.address, 
      { from: creator }
    );

    await this.adaptorRouter.addPair(
      this.DAIMock.address, 
      'VenusAdaptor',
      this.cDAIMock.address, 
      { from: creator }
    );

    await this.saver.setAdaptors(
      [
        this.alpacaAdaptor.address, 
        this.venusAdaptor.address
      ], 
      { from: creator }
    );

    await this.saver.setTokenRebalancer(
      this.DAIMock.address,
      this.Rebalancer.address, 
      { from: creator }
    );

  })

  it('setAdaptors same with address', async function () {
    (await this.saver.allAdaptors(0)).should.equal(this.alpacaAdaptor.address);
  });

  it('getAmount', async function () {
    (await this.saver.getAmount(this.DAIMock.address)).toString().should.equal('0');
  });

  it('getRate', async function () {
    (await this.saver.getRate(this.DAIMock.address)).toString().should.equal('0');
  });

  it('getAPRs', async function () {
    await this.DAIMock.transfer(this.iDAIMock.address, BNify('100').mul(this.one), {from: creator});
    await this.iDAIMock.setVaultDebtVal(BNify('50').mul(this.one));
    // const aprs = await this.saver.getAPRs(this.DAIMock.address);
    // (await this.saver.getAPRs(this.DAIMock.address)).toString().should.equal('0');
  });

  it('rebalance', async function () {
    await this.DAIMock.transfer(this.iDAIMock.address, BNify('100').mul(this.one), {from: creator});
    await this.iDAIMock.setVaultDebtVal(BNify('50').mul(this.one));

    await this.DAIMock.transfer(
      this.saver.address, 
      BNify('100').mul(this.one), 
      {from: creator}
    );

    const holdAmount = await this.DAIMock.balanceOf(this.saver.address);
    const alloctions = await this.saver.getCurrentAllocations(this.DAIMock.address);
    // console.log('alloctions', holdAmount.toString(), alloctions)
    await this.saver.rebalance(this.DAIMock.address);
    // check balance
    const leftBalance = await this.DAIMock.balanceOf(this.saver.address)
    leftBalance.should.be.bignumber.equal(BNify('0'), 'nothing left');

    // check getAmount
    const amount = await this.saver.getAmount(this.DAIMock.address);
    amount.should.be.bignumber.equal(BNify('100').mul(this.one), 'getAmount match');

    // const usedAdaptor = await this.saver.getCurrentAdaptorsUsed(this.DAIMock.address, [0]);
    // console.log(
    //   usedAdaptor.toString(), 
    //   this.alpacaAdaptor.address.toString()
    // )
    // usedAdaptor.should.be.equal(usedAdaptor.toString(), this.venusAdaptor.address.toString(),
    //  'adaptor venus');
    // const targetMock = usedAdaptor.toString() == this.venusAdaptor.address.toString() ? this.cDAIMock  : this.iDAIMock

    // const venusBalance = await targetMock.balanceOf(targetMock.address)
    //  venusBalance.should.be.bignumber.equal(BNify('100').mul(this.one), 
    //  'venus hold all balance')
    //  const adaptorCtokenBalances = await targetMock.balanceOf(usedAdaptor)
    //  adaptorCtokenBalances.should.be.bignumber.equal(BNify('500000000000'), 
    //  'adaptor hold all cToken balance')
  });


  it('rebalance when alloctions changed', async function () {
    await this.DAIMock.transfer(this.iDAIMock.address, BNify('100').mul(this.one), {from: creator});
    await this.iDAIMock.setVaultDebtVal(BNify('50').mul(this.one));
    let token_ = this.DAIMock.address;
    await this.DAIMock.transfer(
      this.saver.address, 
      BNify('100').mul(this.one), 
      {from: creator}
    );

    await this.saver.rebalance(token_);

    const beforeAlloctions = (await this.saver.getCurrentAllocations(token_)).amounts.map(_ => _.toString());
    beforeAlloctions[0].should.be.equal("100000000000000000000", 'first should be 100%');
    beforeAlloctions[1].should.be.equal("0", 'second should be 0%');

    // change alloctions
    await this.Rebalancer.setAllocations(
      [
        BNify('20000'), 
        BNify('80000')
      ],
      [
        this.venusAdaptor.address,
        this.alpacaAdaptor.address,
      ],
      { from: someone }
    );

    await this.saver.rebalance(this.DAIMock.address);

    const afterAlloctions = (await this.saver.getCurrentAllocations(token_)).amounts.map(_ => _.toString());

    afterAlloctions[0].should.be.equal("20000000000000000000", 'first should be 20%');
    afterAlloctions[1].should.be.equal("80000000000000000000", 'second should be 80%');

    // check balance
    const leftBalance = await this.DAIMock.balanceOf(this.saver.address)
    leftBalance.should.be.bignumber.equal(BNify('0'), 'nothing left');

    // check getAmount
    const amount = await this.saver.getAmount(this.DAIMock.address);
    amount.should.be.bignumber.equal(BNify('100').mul(this.one), 'getAmount match');

    // const allAdaptors = await this.saver.getAllAdaptors();
    // console.log(allAdaptors)
  });


  it('withdraw', async function () {
    await this.DAIMock.transfer(this.iDAIMock.address, BNify('100').mul(this.one), {from: creator});
    await this.iDAIMock.setVaultDebtVal(BNify('50').mul(this.one));

    await this.DAIMock.transfer(
      this.saver.address, 
      BNify('100').mul(this.one), 
      {from: creator}
    );

     // fund cDAIMock with 100 DAI
     await this.DAIMock.transfer(
      this.cDAIMock.address,
      BNify('100').mul(this.one), 
      {from: creator}
    );

    await this.saver.rebalance(
      this.DAIMock.address,
    );

    const allAmount = await this.saver.getAmount(this.DAIMock.address);
    // console.log('saver amount', allAmount.div(this.one).toString());
    await this.saver.withdraw(this.DAIMock.address, BNify('100').mul(this.one), nonOwner);
    // console.log((await this.DAIMock.balanceOf(nonOwner)).div(this.one).toString());
    (await this.DAIMock.balanceOf(nonOwner)).div(this.one).toString().should.be.equal("100");
    //  const afterOneWithdrawAmount = await this.saver.getAmount(this.DAIMock.address);
    //  console.log(afterOneWithdrawAmount.div(this.one).toString());

    //  const afterWithdrawBalance = await this.DAIMock.balanceOf(nonOwner)
    //  afterWithdrawBalance.should.be.bignumber.equal(BNify('0'), 'all withdraw left');
  });

})