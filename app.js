// --- TAB MANAGEMENT LOGIC ---
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
    document.querySelectorAll('.tab-button').forEach(button => button.classList.remove('active'));

    document.getElementById(tabId).classList.remove('hidden');
    document.getElementById('tab-' + tabId).classList.add('active');
    
    if (contract && provider) {
        if (tabId === 'dashboard') {
            fetchAndDisplayLoans();
        } else if (tabId === 'borrower') {
            fetchBorrowerPortfolio();
        } else if (tabId === 'lender') {
            fetchLenderPortfolio();
        }
    }
}

const CONTRACT_ADDRESS = "0xf476C5160F9EBc74d5D768DdE063e3331D148559";
const STATUS_NAMES = ["Posted", "Funded", "Repaid", "Liquidated", "Canceled"];
const ABI = LENDQUEST_ABI; 

let provider, signer, contract;
let isConnecting = false;

// --- UTILITY FUNCTIONS ---

function setStatus(msg) {
    const statusElement = document.getElementById("status");
    statusElement.innerHTML = msg;
    statusElement.className = "status-message";

    if (msg.includes("Error") || msg.includes("❌")) {
        statusElement.classList.add('error');
    } else if (msg.includes("✅")) {
        statusElement.classList.add('success');
    } else {
        statusElement.classList.add('info');
    }
}

function formatError(err) {
    return err?.info?.error?.message || err?.message || String(err);
}

function formatTime(totalSeconds) {
    const days = Math.floor(totalSeconds / (3600 * 24));
    const remainingSecondsAfterDays = totalSeconds % (3600 * 24);
    const hours = Math.floor(remainingSecondsAfterDays / 3600);
    const remainingSecondsAfterHours = remainingSecondsAfterDays % 3600;
    const minutes = Math.floor(remainingSecondsAfterHours / 60);
    const seconds = remainingSecondsAfterHours % 60;

    let parts = [];
    if (days > 0) {
        parts.push(`${days}d`);
    }
    if (hours > 0) {
        parts.push(`${hours}h`);
    }
    if (minutes > 0) {
        parts.push(`${minutes}m`);
    }

    if (parts.length > 0) {
        return parts.join(' ');
    }
    
    return `${seconds} seconds`;
}

function formatTimestampToDate(timestamp) {
    const date = new Date(Number(timestamp) * 1000);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}


async function fetchAndDisplayReputation(address, displayElementId) {
    if (!contract || !address) return;

    try {
        const readContract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
        const rep = await readContract.reputation(address);
        
        document.getElementById(displayElementId).innerHTML = 
            `<span class="reputation">${Number(rep.toString())}</span>`;

        document.getElementById("headerReputationStatus").innerText = '';

    } catch (err) {
        console.error(`Error fetching reputation for ${address}:`, err);
        document.getElementById(displayElementId).innerText = `Error fetching score.`;
    }
}

async function connectWallet() {
    if (isConnecting) return;
    isConnecting = true;
    try {
        if (!window.ethereum) {
            setStatus("❌ Error: Please install a Web3 wallet (e.g., MetaMask).");
            return;
        }

        await window.ethereum.request({ method: "eth_requestAccounts" });

        provider = new ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();
        contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

        const addr = await signer.getAddress();
        const shortAddr = addr.substring(0, 6) + "..." + addr.substring(addr.length - 4);
        
        document.getElementById("headerAccountStatus").innerText = shortAddr;
        document.getElementById("modalShortAddress").innerText = shortAddr;
        
        document.getElementById("modalFullAddress").innerText = addr;
        
        await fetchAndDisplayReputation(addr, "modalReputation");

        document.getElementById("contractAddress").innerText = CONTRACT_ADDRESS;
        document.getElementById("contractLink").href =
            "https://sepolia.etherscan.io/address/" + CONTRACT_ADDRESS; 
        document.getElementById("modalTitle").innerText = "Wallet Connected";
        document.getElementById("modalContentConnected").classList.remove('hidden');
        document.getElementById("modalContentDisconnected").classList.add('hidden');
        setStatus("Wallet connected. Loading data...");
        
        switchTab('dashboard');

    } catch (err) {
        console.error(err);
        setStatus("❌ Error connecting wallet: " + formatError(err));
    } finally {
        isConnecting = false;
    }
}

async function disconnectWallet() {

    provider = null;
    signer = null;
    contract = null;
    
    document.getElementById("headerAccountStatus").innerText = "Connect Wallet";
    document.getElementById("modalShortAddress").innerText = "Not Connected";
    document.getElementById("modalFullAddress").innerText = "Not connected.";
    
    document.getElementById("modalTitle").innerText = "Connect Wallet";
    document.getElementById("modalContentConnected").classList.add('hidden');
    document.getElementById("modalContentDisconnected").classList.remove('hidden');

    document.getElementById("loanList").innerHTML = '';
    document.getElementById("borrowerLoanList").innerHTML = '';
    document.getElementById("lenderLoanList").innerHTML = '';

    setStatus("Successfully disconnected. Connect wallet to use features.");
    closeUserModal();
}

// --- MODAL FUNCTIONS ---

function openUserModal() {
    const modal = document.getElementById("userModal");
    modal.classList.remove('hidden');
}

function closeUserModal() {
    const modal = document.getElementById("userModal");
    modal.classList.add('hidden');
}


// --- DASHBOARD FUNCTIONS ---

async function fetchAndDisplayLoans() {
    if (!contract) {
        document.getElementById("loanListStatus").innerText = "Connect your wallet to view available loans.";
        return;
    }

    const listContainer = document.getElementById("loanList");
    const statusElement = document.getElementById("loanListStatus");
    listContainer.innerHTML = '';
    statusElement.innerText = 'Loading posted loans...';

    try {
        const nextId = await contract.nextId();
        const totalLoans = Number(nextId) - 1;
        let postedLoans = 0;

        const readContract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

        const loanPromises = [];
        for (let i = 1; i <= totalLoans; i++) {
            loanPromises.push(readContract.loans(i).then(loan => ({ id: i, loan })));
        }

        const loanResults = await Promise.all(loanPromises);

        for (const { id, loan } of loanResults) {
            
            if (Number(loan.status) === 0 && loan.borrower !== ethers.ZeroAddress) {
                postedLoans++;
                
                let borrowerReputation;
                try {
                    const repBigInt = await readContract.reputation(loan.borrower);
                    borrowerReputation = Number(repBigInt.toString());
                } catch (e) {
                    borrowerReputation = 'N/A';
                }

                const card = document.createElement('div');
                card.className = 'loan-card status-0';
                
                const principalEth = ethers.formatEther(loan.principal);
                const collateralEth = ethers.formatEther(loan.collateral);

                const cardHTML = `
                    <div>
                        <h3>Loan Request #${id}</h3>
                        <p><strong>Principal:</strong> ${principalEth} ETH</p>
                        <p><strong>Collateral:</strong> ${collateralEth} ETH</p>
                        <p><strong>Rate:</strong> ${Number(loan.rateBps) / 100}%</p>
                        <p><strong>Duration:</strong> ${formatTime(Number(loan.duration))}</p>
                        <p><strong>Borrower Reputation:</strong> <span class="reputation">${borrowerReputation}</span></p>
                        <p class="small-text">Borrower: ${loan.borrower.substring(0, 10)}...</p>
                        <p class="small-text">Description: ${loan.description}</p>
                    </div>
                    <div class="loan-card-actions">
                        <button onclick="fundLoanFromList(${id}, '${principalEth}')" class="button-success">
                            Fund This Loan (${principalEth} ETH)
                        </button>
                    </div>
                `;
                card.innerHTML = cardHTML;
                listContainer.appendChild(card);
            }
        }

        if (postedLoans === 0) {
            statusElement.innerText = "No loan requests are currently posted.";
        } else {
            statusElement.innerText = `Showing ${postedLoans} available loan request(s).`;
        }
    } catch (err) {
        console.error("Error fetching loans:", err);
        statusElement.innerText = `❌ Error loading loans: ${formatError(err)}`;
    }
}

// --- BORROWER FUNCTIONS ---

async function repayLoanFromList(id) {
    if (!contract) return setStatus("❌ Connect wallet first.");
    
    try {
        const [principal, interest, total] = await contract.amountOwed(id);
        const totalEth = ethers.formatEther(total);

        setStatus(`Repaying loan ${id} (Total: ${totalEth} ETH)... Please confirm transaction.`);
        const tx = await contract.repay(id, { value: total });
        await tx.wait();

        setStatus(
            `✅ Loan repaid! Total: ${totalEth} ETH. Tx: <a href="https://sepolia.etherscan.io/tx/${tx.hash}" target="_blank" class="text-link">${tx.hash.substring(0,10)}...</a>`
        );
        fetchBorrowerPortfolio();
    } catch (err) {
        console.error(err);
        setStatus("❌ Error repaying loan: " + formatError(err));
    }
}

async function cancelLoanFromList(id) {
    if (!contract) return setStatus("❌ Connect wallet first.");

    try {
        setStatus(`⏳ Cancelling loan ${id} (must be the borrower and status 'Posted')... Please confirm transaction.`);

        const tx = await contract.cancelRequest(id);
        await tx.wait();

        setStatus(`✅ Loan ${id} cancelled. Tx: <a href="https://sepolia.etherscan.io/tx/${tx.hash}" target="_blank" class="text-link">${tx.hash.substring(0,10)}...</a>`);
        fetchBorrowerPortfolio();
    } catch (err) {
        console.error(err);
        setStatus(`❌ Error cancelling loan: ${formatError(err)}`);
    }
}


async function fetchBorrowerPortfolio() {
    if (!contract) {
        document.getElementById("borrowerPortfolioStatus").innerText = "Connect your wallet and switch to this tab to load your loan status.";
        return;
    }

    const borrowerAddress = await signer.getAddress();
    const listContainer = document.getElementById("borrowerLoanList");
    const statusElement = document.getElementById("borrowerPortfolioStatus");
    listContainer.innerHTML = '';
    statusElement.innerText = 'Loading your borrower portfolio...';

    try {
        const nextId = await contract.nextId();
        const totalLoans = Number(nextId) - 1;
        let borrowerLoansFound = 0;

        const readContract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
        const currentTime = Math.floor(Date.now() / 1000);

        const loanPromises = [];
        for (let i = 1; i <= totalLoans; i++) {
            loanPromises.push(readContract.loans(i).then(loan => ({ id: i, loan })));
        }
        const loanResults = await Promise.all(loanPromises);

        for (const { id, loan } of loanResults) {
            
            if (loan.borrower.toLowerCase() === borrowerAddress.toLowerCase()) {
                borrowerLoansFound++;

                const status = Number(loan.status);
                const principalEth = ethers.formatEther(loan.principal);
                const collateralEth = ethers.formatEther(loan.collateral);
                let dueTime = loan.dueTime;
                let cardClass = 'loan-card';
                let actionButton = '';
                let statusDescription = STATUS_NAMES[status];
                
                let totalOwedEth = "0";
                if (status === 1) {
                    const [, , total] = await contract.amountOwed(id);
                    totalOwedEth = ethers.formatEther(total);
                }

                if (status === 0) {
                    cardClass += ' status-0 borrower-posted';
                    actionButton = `<button onclick="cancelLoanFromList(${id})" class="button-cancel">Cancel Request</button>`;
                } else if (status === 1) {
                    if (currentTime > Number(dueTime)) {
                        cardClass += ' status-1 overdue';
                        statusDescription += ' (OVERDUE)';
                    } else {
                        cardClass += ' status-1';
                    }
                    actionButton = `<button onclick="repayLoanFromList(${id})" class="button-repay">Repay Loan (${totalOwedEth} ETH)</button>`;
                } else if (status === 2) {
                    cardClass += ' status-2';
                } else {
                    cardClass += ' status-3';
                }

                const cardHTML = `
                    <div>
                        <h3>Loan #${id} - ${statusDescription}</h3>
                        <p><strong>Principal:</strong> ${principalEth} ETH</p>
                        <p><strong>Collateral:</strong> ${collateralEth} ETH</p>
                        ${status === 1 ? `<p><strong>Amount Due:</strong> ${totalOwedEth} ETH</p>` : ''}
                        ${status !== 0 ? `<p><strong>Due Date:</strong> ${formatTimestampToDate(dueTime)}</p>` : ''}
                        <p><strong>Duration:</strong> ${formatTime(Number(loan.duration))}</p>
                        <p class="small-text">Description: ${loan.description}</p>
                    </div>
                    ${actionButton ? `<div class="loan-card-actions">${actionButton}</div>` : ''}
                `;
                
                const card = document.createElement('div');
                card.className = cardClass;
                card.innerHTML = cardHTML;
                listContainer.appendChild(card);
            }
        }

        if (borrowerLoansFound === 0) {
            statusElement.innerText = "No loans found where you are the borrower.";
        } else {
            statusElement.innerText = `Showing ${borrowerLoansFound} loan(s) in your borrower portfolio.`;
        }
    } catch (err) {
        console.error("Error fetching borrower portfolio:", err);
        statusElement.innerText = `❌ Error loading borrower portfolio: ${formatError(err)}`;
    }
}

// --- LENDER FUNCTIONS ---

async function seizeCollateralFromList(id) {
    if (!contract) return setStatus("❌ Connect wallet first.");

    try {
        setStatus(`Seizing collateral for loan ${id} (if overdue)... Please confirm transaction.`);
        const tx = await contract.seizeCollateral(id);
        await tx.wait(); 
        setStatus(`✅ Collateral seized! Tx: <a href="https://sepolia.etherscan.io/tx/${tx.hash}" target="_blank" class="text-link">${tx.hash.substring(0,10)}...</a>`);
        fetchLenderPortfolio();
    } catch (err) {
        console.error(err);
        setStatus("❌ Error seizing collateral: " + formatError(err));
    }
}

async function fetchLenderPortfolio() {
    if (!contract) {
        document.getElementById("lenderPortfolioStatus").innerText = "Connect your wallet and switch to this tab to load your funded loans.";
        return;
    }

    const lenderAddress = await signer.getAddress();
    const listContainer = document.getElementById("lenderLoanList");
    const statusElement = document.getElementById("lenderPortfolioStatus");
    listContainer.innerHTML = '';
    statusElement.innerText = 'Loading your lender portfolio...';

    try {
        const nextId = await contract.nextId();
        const totalLoans = Number(nextId) - 1;
        let lenderLoansFound = 0;

        const readContract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
        const currentTime = Math.floor(Date.now() / 1000);

        const loanPromises = [];
        for (let i = 1; i <= totalLoans; i++) {
            loanPromises.push(readContract.loans(i).then(loan => ({ id: i, loan })));
        }
        const loanResults = await Promise.all(loanPromises);

        for (const { id, loan } of loanResults) {
            
            if (loan.lender.toLowerCase() === lenderAddress.toLowerCase()) {
                lenderLoansFound++;

                const status = Number(loan.status);
                const principalEth = ethers.formatEther(loan.principal);
                let cardClass = 'loan-card';
                let actionButton = '';
                let statusDescription = STATUS_NAMES[status];

                if (status === 1) {
                    const isOverdue = currentTime > Number(loan.dueTime);
                    if (isOverdue) {
                        cardClass += ' status-1 overdue';
                        statusDescription += ' (SEIZEABLE)';
                        actionButton = `<button onclick="seizeCollateralFromList(${id})" class="button-seize">Seize Collateral</button>`;
                    } else {
                        cardClass += ' status-1 not-overdue';
                    }
                } else if (status === 2) {
                    cardClass += ' status-2';
                } else if (status === 3) {
                    cardClass += ' status-3';
                } else {
                    cardClass += ' status-3'; 
                }
                
                const cardHTML = `
                    <div>
                        <h3>Loan #${id} - ${statusDescription}</h3>
                        <p><strong>Principal Invested:</strong> ${principalEth} ETH</p>
                        <p><strong>Interest Rate:</strong> ${Number(loan.rateBps) / 100}%</p>
                        <p><strong>Due Date:</strong> ${formatTimestampToDate(loan.dueTime)}</p>
                        <p class="small-text">Borrower: ${loan.borrower.substring(0, 10)}...</p>
                    </div>
                    ${actionButton ? `<div class="loan-card-actions">${actionButton}</div>` : ''}
                `;
                
                const card = document.createElement('div');
                card.className = cardClass;
                card.innerHTML = cardHTML;
                listContainer.appendChild(card);
            }
        }

        if (lenderLoansFound === 0) {
            statusElement.innerText = "No loans found where you are the lender.";
        } else {
            statusElement.innerText = `Showing ${lenderLoansFound} loan(s) in your lender portfolio.`;
        }
    } catch (err) {
        console.error("Error fetching lender portfolio:", err);
        statusElement.innerText = `❌ Error loading lender portfolio: ${formatError(err)}`;
    }
}


// --- TRANSACTION FUNCTIONS (USED BY POSTING) ---

async function postLoan() {
    if (!contract) return setStatus("❌ Connect wallet first.");

    const principalEth = document.getElementById("principalEth").value;
    const rateBps = document.getElementById("rateBps").value;
    const duration = document.getElementById("duration").value;
    const collateralEth = document.getElementById("collateralEth").value;
    const description = document.getElementById("description").value;

    try {
        const principalWei = ethers.parseEther(principalEth);
        const collateralWei = ethers.parseEther(collateralEth);

        setStatus("Posting loan... Please confirm transaction in your wallet.");
        const tx = await contract.postRequest(
            principalWei,
            rateBps,
            duration,
            description,
            { value: collateralWei }
        );
        const receipt = await tx.wait();
        setStatus(`✅ Loan posted! Tx: <a href="https://sepolia.etherscan.io/tx/${tx.hash}" target="_blank" class="text-link">${tx.hash.substring(0,10)}...</a> | Block: ${receipt.blockNumber}`);
        
        switchTab('dashboard');
        
    } catch (err) {
        console.error(err);
        setStatus("❌ Error posting loan: " + formatError(err));
    }
}

async function fundLoanFromList(id, principalEth) {
    if (!contract) return setStatus("❌ Connect wallet first.");

    try {
        const principalWei = ethers.parseEther(principalEth); 

        setStatus(`Funding loan ${id} with ${principalEth} ETH... Please confirm transaction.`);
        const tx = await contract.fund(id, { value: principalWei });
        await tx.wait();
        setStatus(`✅ Loan ${id} funded! Tx: <a href="https://sepolia.etherscan.io/tx/${tx.hash}" target="_blank" class="text-link">${tx.hash.substring(0,10)}...</a>`);

        fetchAndDisplayLoans();
        fetchLenderPortfolio();
    } catch (err) {
        console.error(err);
        setStatus("❌ Error funding loan: " + formatError(err));
    }
}

async function viewLoan() {
    if (!contract) return setStatus("❌ Connect wallet first.");
    const id = document.getElementById("viewLoanId").value;
    if (!id) return setStatus("❌ Please enter a Loan ID to view details.");

    try {
        const loan = await contract.loans(id);
        if (loan.borrower === ethers.ZeroAddress) {
            document.getElementById("loanInfo").innerText = "No loan found for that ID.";
            return;
        }

        let owedInfo = {};
        if (Number(loan.status) === 1) {
            const [principal, interest, total] = await contract.amountOwed(id);
            owedInfo = {
                Total_Owed_ETH: ethers.formatEther(total),
                Owed_Principal_ETH: ethers.formatEther(principal),
                Owed_Interest_ETH: ethers.formatEther(interest)
            };
        }
        
        const repBigInt = await contract.reputation(loan.borrower);
        const borrowerReputation = Number(repBigInt.toString());

        const data = {
            id: id,
            borrower: loan.borrower,
            lender: loan.lender,
            borrowerReputation: borrowerReputation,
            collateralEth: ethers.formatEther(loan.collateral),
            principalEth: ethers.formatEther(loan.principal),
            rateBps: loan.rateBps.toString(),
            durationSeconds: loan.duration.toString(),
            startTime: formatTimestampToDate(loan.startTime),
            dueTime: formatTimestampToDate(loan.dueTime),
            status: STATUS_NAMES[Number(loan.status)],
            description: loan.description,
            ...owedInfo
        };

        document.getElementById("loanInfo").innerText = JSON.stringify(data, null, 2);
        setStatus(`Details loaded for Loan #${id}. Status: ${data.status}`);
    } catch (err) {
        console.error(err);
        document.getElementById("loanInfo").innerText =
            "❌ Error viewing loan: " + formatError(err);
    }
}

// --- INITIALIZATION AND EVENT LISTENERS ---

window.fundLoanFromList = fundLoanFromList;
window.switchTab = switchTab; 
window.openUserModal = openUserModal;
window.closeUserModal = closeUserModal;
window.seizeCollateralFromList = seizeCollateralFromList;
window.repayLoanFromList = repayLoanFromList;
window.cancelLoanFromList = cancelLoanFromList;

document.getElementById("modalConnectButton").onclick = connectWallet;
document.getElementById("disconnectButton").onclick = disconnectWallet;
document.getElementById("postButton").onclick = postLoan;
document.getElementById("viewButton").onclick = viewLoan;

window.onload = () => {
    switchTab('dashboard'); 
    document.getElementById("modalContentConnected").classList.add('hidden');
    document.getElementById("modalContentDisconnected").classList.remove('hidden');
};