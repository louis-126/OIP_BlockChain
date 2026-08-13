// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

/**
 * @title  xhampterr
 * @notice OTH Summer School — voting contract.
 *
 * Test requirements
 * ─────────────────
 *  ✔ Topics defined by the constructor
 *  ✔ Everybody can vote exactly once
 *  ✔ Result of the voting can be printed
 *  ✔ Contract must be secure  (require guards + admin role)
 *  ✔ Blacklist — accounts that are NOT allowed to vote
 *
 * Based on the lecture patterns (Poll V1 + V2) and the
 * hendrikebbers/oth-summer-school repository baseline.
 */
contract xhampterr {

    // ─────────────────────────────────────────────
    //  Data structures  (matches lecture slides)
    // ─────────────────────────────────────────────

    struct Proposal {
        bytes32 name;   // topic name — pass as bytes32 from Remix / SDK
        uint    count;  // running vote tally
    }

    /**
     * @dev Three-state enum:
     *   NotVoted   – default, address may vote (if not blacklisted)
     *   Voted      – already cast a vote; cannot vote again
     */
    enum VoterState { NotVoted, Voted }

    // ─────────────────────────────────────────────
    //  State
    // ─────────────────────────────────────────────

    address public admin;

    /// @dev All voting topics — publicly readable (lecture pattern).
    Proposal[] public proposals;

    /// @dev Tracks whether an address has already voted.
    mapping(address => VoterState) public voters;

    /**
     * @dev Blacklist: accounts flagged here cannot vote.
     *      (Spec calls this "whitelist of accounts not allowed to vote".)
     */
    mapping(address => bool) public blacklist;

    // ─────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────

    event Voted               (address indexed voter,   uint indexed proposalIndex);
    event AddedToBlacklist    (address indexed account);
    event RemovedFromBlacklist(address indexed account);

    // ─────────────────────────────────────────────
    //  Modifiers
    // ─────────────────────────────────────────────

    modifier onlyAdmin() {
        require(msg.sender == admin, "xhampterr: caller is not admin");
        _;
    }

    // ─────────────────────────────────────────────
    //  Constructor — topics defined here
    // ─────────────────────────────────────────────

    /**
     * @param proposalNames  Voting topics as a bytes32 array.
     *
     * Remix tip — use the helper stringToBytes32() to preview a value,
     * then pass the array like:
     *   ["0x546f706963410000...","0x546f706963420000..."]
     *
     * SDK tip (deploy.js) — pass as --arg-bytes32-array "TopicA" "TopicB"
     */
    constructor(bytes32[] memory proposalNames) {
        admin = msg.sender; // creator becomes admin (lecture V2 pattern)

        for (uint i = 0; i < proposalNames.length; i++) {
            proposals.push(Proposal({
                name:  proposalNames[i],
                count: 0
            }));
        }
    }

    // ─────────────────────────────────────────────
    //  Core: Vote
    // ─────────────────────────────────────────────

    /**
     * @notice Cast one vote for a proposal.
     * @dev    Security checks (require pattern from lecture):
     *           1. Caller must not be blacklisted.
     *           2. Caller must not have voted before.
     *           3. Proposal index must be in range.
     *
     * @param proposal  Zero-based index in the proposals array.
     */
    function vote(uint proposal) public {
        require(
            !blacklist[msg.sender],
            "xhampterr: your address is not permitted to vote"
        );
        require(
            voters[msg.sender] == VoterState.NotVoted,
            "xhampterr: you have already voted"
        );
        require(
            proposal < proposals.length,
            "xhampterr: invalid proposal index"
        );

        voters[msg.sender] = VoterState.Voted;
        proposals[proposal].count++;

        emit Voted(msg.sender, proposal);
    }

    // ─────────────────────────────────────────────
    //  Results  (lecture: iterate + maxCount pattern)
    // ─────────────────────────────────────────────

    /**
     * @notice Returns the winning topic.
     *         Ties go to the lower index (first entered).
     *
     * @return winnerName   Name of the leading proposal.
     * @return winnerIndex  Its index in the array.
     * @return winnerVotes  Its vote count.
     */
    function winner()
        public
        view
        returns (bytes32 winnerName, uint winnerIndex, uint winnerVotes)
    {
        uint maxCount = 0;
        for (uint i = 0; i < proposals.length; i++) {
            if (proposals[i].count > maxCount) {
                maxCount    = proposals[i].count;
                winnerName  = proposals[i].name;
                winnerIndex = i;
                winnerVotes = proposals[i].count;
            }
        }
    }

    /**
     * @notice Returns every proposal name and its vote count.
     *         Use this to print the full scoreboard.
     */
    function getResults()
        public
        view
        returns (bytes32[] memory names, uint[] memory counts)
    {
        names  = new bytes32[](proposals.length);
        counts = new uint[](proposals.length);

        for (uint i = 0; i < proposals.length; i++) {
            names[i]  = proposals[i].name;
            counts[i] = proposals[i].count;
        }
    }

    // ─────────────────────────────────────────────
    //  Admin: Blacklist management
    // ─────────────────────────────────────────────

    /**
     * @notice Block an address from voting.
     *         If they have already voted the vote stands;
     *         future calls to vote() will be rejected.
     */
    function addToBlacklist(address account) public onlyAdmin {
        require(account != address(0), "xhampterr: zero address");
        require(!blacklist[account],   "xhampterr: already blacklisted");
        blacklist[account] = true;
        emit AddedToBlacklist(account);
    }

    /**
     * @notice Remove an address from the blacklist.
     *         Note: if they voted before being blacklisted,
     *         VoterState.Voted is permanent — they still cannot vote again.
     */
    function removeFromBlacklist(address account) public onlyAdmin {
        require(blacklist[account], "xhampterr: not blacklisted");
        blacklist[account] = false;
        emit RemovedFromBlacklist(account);
    }

    // ─────────────────────────────────────────────
    //  View helpers
    // ─────────────────────────────────────────────

    /// @notice Total number of voting topics.
    function proposalCount() public view returns (uint) {
        return proposals.length;
    }

    /// @notice Check whether an address has already voted.
    function hasVoted(address account) public view returns (bool) {
        return voters[account] == VoterState.Voted;
    }

    /// @notice Check whether an address is on the blacklist.
    function isBlacklisted(address account) public view returns (bool) {
        return blacklist[account];
    }

    // ─────────────────────────────────────────────
    //  Utility — bytes32 encoding helper for Remix
    // ─────────────────────────────────────────────

    /**
     * @notice Convert a short string (≤ 32 chars) to bytes32.
     *         Call this in Remix, copy the result, and paste it into the
     *         constructor array.  Not needed when using the SDK deploy script.
     */
    function stringToBytes32(string memory text)
        public
        pure
        returns (bytes32 result)
    {
        require(bytes(text).length <= 32, "xhampterr: string exceeds 32 chars");
        // solhint-disable-next-line no-inline-assembly
        assembly {
            result := mload(add(text, 32))
        }
    }
}
