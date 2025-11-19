// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

contract LendQuest {
    enum Status {
        Posted,
        Funded,
        Repaid,
        Liquidated,
        Canceled
    }

    struct Loan {
        address borrower;       // who created the quest/loan
        address lender;         // who funded it
        uint256 collateral;     // how much ETH is locked as security
        uint256 principal;      // how much ETH borrower wants to borrow    
        uint256 rateBps;        // interest rate
        uint256 duration;       // how long the loan lasts
        uint256 startTime;      // timestamp when funded
        uint256 dueTime;        // timestamp when repayment is due
        Status status;          // which enum value applies right now
        string description;     // what this quest/loan is for
    }

    uint256 public nextId = 1;
    mapping(uint256 => Loan) public loans;

    event LoanPosted(
    uint256 indexed id,
    address indexed borrower,
    uint256 collateral,
    uint256 principal,
    uint256 rateBps,
    uint256 duration,
    string description
    );

    // reputation score for each user
    mapping(address => uint256) public reputation;

    event ReputationUpdated(
        address indexed user,
        uint256 newReputation
    );

    event LoanCanceled(uint256 indexed id);
    event LoanFunded(uint256 indexed id, address indexed lender);
    event LoanRepaid(uint256 indexed id, uint256 amount);
    event CollateralSeized(uint256 indexed id, uint256 amount);

    // Post a request
    function postRequest(
        uint256 principal,
        uint256 rateBps,
        uint256 duration,
        string calldata description
    ) external payable returns (uint256 id) {
        require(msg.value > 0, "no collateral");
        require(principal > 0, "no principal");
        require(duration > 0, "no duration");
        require(rateBps <= 10_000, "rate too high");

        // enforce collateral ratio
        require(msg.value >= (principal * 150) / 100, "collateral too low");

        id = nextId++;

        loans[id] = Loan({
            borrower: msg.sender,
            lender: address(0),
            collateral: msg.value,
            principal: principal,
            rateBps: rateBps,
            duration: duration,
            startTime: 0,
            dueTime: 0,
            status: Status.Posted,
            description: description
        });

        emit LoanPosted(id, msg.sender, msg.value, principal, rateBps, duration, description);
    }

    // Cancel an unfunded request
    function cancelRequest(uint256 id) external {
        Loan storage L = loans[id];
        require(L.status == Status.Posted, "not posted");
        require(L.borrower == msg.sender, "not borrower");

        L.status = Status.Canceled;
        _safeSend(L.borrower, L.collateral); // refund escrowed ETH
        emit LoanCanceled(id);
    }

    // internal helper to send ETH safely
    function _safeSend(address to, uint256 amt) internal {
        (bool ok, ) = to.call{value: amt}("");
        require(ok, "eth send failed");
    }

    // Fund a posted request (lender sends the principal)
    function fund(uint256 id) external payable {
        Loan storage L = loans[id];
        require(L.status == Status.Posted, "not post");
        require(L.borrower != address(0), "no loan");
        require(msg.sender != L.borrower, "self fund");
        require(msg.value == L.principal, "wrong principal");

        // start the loan
        L.lender = msg.sender;
        L.startTime = block.timestamp;
        L.dueTime = block.timestamp + L.duration;
        L.status = Status.Funded;

        // forward the principal to the borrower
        _safeSend(L.borrower, msg.value);

        emit LoanFunded(id, msg.sender);

    }

    // View interest math
    function amountOwed(uint256 id)
        public
        view
        returns (uint256 principal, uint256 interest, uint256 total)
    {
        Loan storage L = loans[id];
        principal = L.principal;

        // base simple interest
        uint256 baseInterest = (L.principal * L.rateBps) / 10_000;

        // reputation discount tiers
        uint256 rep = reputation[L.borrower];
        uint256 discountBps = 0;

        if (rep >= 15) {
            discountBps = 300; // 3% off interest
        } else if (rep >= 10) {
            discountBps = 200; // 2% off
        } else if (rep >= 5) {
            discountBps = 100; // 1% off
        }

        uint256 discount = (baseInterest * discountBps) / 10_000;
        interest = baseInterest - discount;

        total = principal + interest;
    }


    // Borrower repays principal + interest; collateral returned
    function repay(uint256 id) external payable {
        Loan storage L = loans[id];
        require(L.status == Status.Funded, "not funded");
        require(msg.sender == L.borrower, "not borrower");

        ( , , uint256 total) = amountOwed(id);
        require(msg.value == total, "wrong repay");

        // pay lender
        _safeSend(L.lender, total);
        // return collateral to borrower
        _safeSend(L.borrower, L.collateral);

        L.status = Status.Repaid;
        emit LoanRepaid(id, total);
        
        // successful repayment raises reputation
        reputation[L.borrower] += 1;
        emit ReputationUpdated(L.borrower, reputation[L.borrower]);

    }

    // After dueTime, lender can seize collateral if not repaid
    function seizeCollateral(uint256 id) external {
        Loan storage L = loans[id];
        require(L.status == Status.Funded, "not funded");
        require(block.timestamp > L.dueTime, "not due");
        require(msg.sender == L.lender, "not lender");

        uint256 amt = L.collateral;

        _safeSend(L.lender, amt);   // lender takes the collateral
        L.status = Status.Liquidated;

        emit CollateralSeized(id, amt);
        // borrower defaulted: reduce reputation
        if (reputation[L.borrower] > 0) {
            reputation[L.borrower] -= 1;
            emit ReputationUpdated(L.borrower, reputation[L.borrower]);
        }

    }

}