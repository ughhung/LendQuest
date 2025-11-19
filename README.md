# 💸 LendQuest DApp

## Decentralized Collateralized Peer-to-Peer Lending Platform

LendQuest is a decentralized finance (DeFi) application that facilitates **collateralized peer-to-peer loans** on the Ethereum Virtual Machine (EVM). It connects borrowers who need funds with lenders who are looking to invest.

### Core Functionality

The site is organized into three main sections to manage the full loan lifecycle:

#### 1. Dashboard & Available Loans
* **For Lenders:** View all active loan requests that have been posted by borrowers and are awaiting funding.
* **Funding:** Use the dedicated button to fund an available loan by sending the required principal amount.

#### 2. Borrower Actions
* **Post Request:** Submit a new loan request, defining the principal, interest rate, duration, and locking up the required collateral.
* **My Portfolio:** Track the status of your posted loans (e.g., Posted, Funded, Repaid).
* **Repay/Cancel:** Action buttons to **repay** a funded loan or **cancel** an unfunded request.

#### 3. Lender Actions
* **My Portfolio:** Track the status of loans you have funded.
* **Seize Collateral:** Action button available if a loan becomes overdue, allowing you to claim the borrower's collateral as compensation.

---

### ▶️ Video Demo / Tutorial

For a quick overview of how the LendQuest platform works, view the demonstration below:

https://www.youtube.com/watch?v=kskgtMD6L5c

---

### Technical Details
* **Technology:** HTML, CSS, Vanilla JavaScript, and the **Ethers.js** library for blockchain interaction.
* **Network:** Interacts with a smart contract on the **Sepolia Testnet**.
* **Contract Link:** View on Etherscan: **[0xf476C5160F9EBc74d5D768DdE063e3331D148559](https://sepolia.etherscan.io/address/0xf476C5160F9EBc74d5D768DdE063e3331D148559)**
* **Access:** Requires a Web3 wallet like **MetaMask** to connect and perform transactions.
