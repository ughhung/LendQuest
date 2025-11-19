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
        address borrower;
        address lender;
        uint256 collateral;
        uint256 principal;
        uint256 rateBps;
        uint256 duration;
        uint256 startTime;
        uint256 dueTime;
        Status status;
        string description;
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

    // This tracks how reliable users are. Rep goes up on repayment, down on default.
    mapping(address => uint256) public reputation;

    event ReputationUpdated(
        address indexed user,
        uint256 newReputation
    );

    event LoanCanceled(uint256 indexed id);
    event LoanFunded(uint256 indexed id, address indexed lender);
    event LoanRepaid(uint256 indexed id, uint256 amount);
    event CollateralSeized(uint256 indexed id, uint256 amount);

    // This is the cool part: calculates how much collateral I need to put up.
    // Better rep = lower required collateral percentage.
    function getCollateralRatio(uint256 rep) internal pure returns (uint256 ratioBps) {
        uint256 baseRatioBps = 18000;
        uint256 discountBpsPerTier = 200;
        uint256 tierSize = 5;

        // How many reputation milestones (tiers of 5) have I hit?
        uint256 tiersPassed = rep / tierSize;

        // Cap the collateral discount so it's never lower than 130%
        uint256 maxTiers = (180 - 130) / 2;

        if (tiersPassed > maxTiers) {
            tiersPassed = maxTiers;
        }

        uint256 totalDiscountBps = tiersPassed * discountBpsPerTier;

        return baseRatioBps - totalDiscountBps;
    }
    

    // I call this to put up collateral and list my loan request.
    // The amount of collateral I send (msg.value) must meet my reputation tier requirement.
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

        // Calculate the minimum ETH I need to put up based on my score
        uint256 requiredRatioBps = getCollateralRatio(reputation[msg.sender]);
        uint256 minCollateral = (principal * requiredRatioBps) / 10_000;

        require(msg.value >= minCollateral, "collateral too low for your reputation tier");
        

        id = nextId++;

        // Save the details for the quest
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

    // If my request hasn't been funded yet, I can cancel it and get my ETH back.
    function cancelRequest(uint256 id) external {
        Loan storage L = loans[id];
        require(L.status == Status.Posted, "not posted");
        require(L.borrower == msg.sender, "not borrower");

        L.status = Status.Canceled;
        _safeSend(L.borrower, L.collateral); // Sends back my collateral
        emit LoanCanceled(id);
    }

    // Helper function to send ETH to prevent weird failures
    function _safeSend(address to, uint256 amt) internal {
        (bool ok, ) = to.call{value: amt}("");
        require(ok, "eth send failed");
    }

    // Lenders call this function. They send the principal amount (msg.value).
    function fund(uint256 id) external payable {
        Loan storage L = loans[id];
        require(L.status == Status.Posted, "not post");
        require(L.borrower != address(0), "no loan");
        require(msg.sender != L.borrower, "self fund");
        require(msg.value == L.principal, "wrong principal");

        // Marks me as the lender and starts the clock
        L.lender = msg.sender;
        L.startTime = block.timestamp;
        L.dueTime = block.timestamp + L.duration;
        L.status = Status.Funded;

        // Send the money immediately to the borrower!
        _safeSend(L.borrower, msg.value);

        emit LoanFunded(id, msg.sender);

    }

    // Tells me how much I owe (principal + interest).
    // Rep is only for collateral, not interest cost now.
    function amountOwed(uint256 id)
        public
        view
        returns (uint256 principal, uint256 interest, uint256 total)
    {
        Loan storage L = loans[id];
        principal = L.principal;

        // Simple interest based only on the rateBps
        interest = (L.principal * L.rateBps) / 10_000;

        total = principal + interest;
    }
    

    // Borrower calls this to pay back the loan.
    function repay(uint256 id) external payable {
        Loan storage L = loans[id];
        require(L.status == Status.Funded, "not funded");
        require(msg.sender == L.borrower, "not borrower");

        ( , , uint256 total) = amountOwed(id);
        require(msg.value == total, "wrong repay");

        // 1. Pay the lender the total amount
        _safeSend(L.lender, total);
        // 2. Return my collateral! Yay!
        _safeSend(L.borrower, L.collateral);

        L.status = Status.Repaid;
        emit LoanRepaid(id, total);
        
        // Success! My reputation goes up by 1.
        reputation[L.borrower] += 1;
        emit ReputationUpdated(L.borrower, reputation[L.borrower]);

    }

    // Lender calls this IF I default and the due time is passed.
    function seizeCollateral(uint256 id) external {
        Loan storage L = loans[id];
        require(L.status == Status.Funded, "not funded");
        require(block.timestamp > L.dueTime, "not due");
        require(msg.sender == L.lender, "not lender");

        uint256 amt = L.collateral;

        _safeSend(L.lender, amt);   // Lender takes the collateral as payment
        L.status = Status.Liquidated;

        emit CollateralSeized(id, amt);
        // I failed to repay. My reputation goes down by 1.
        if (reputation[L.borrower] > 0) {
            reputation[L.borrower] -= 1;
            emit ReputationUpdated(L.borrower, reputation[L.borrower]);
        }

    }

}