// Prints ESLint findings one per line (file:line rule message), for a quick read in a terminal.
//   npx eslint . --format json | node scripts/lint-summary.mjs
let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
    let count = 0;
    for (const file of JSON.parse(input)) {
        for (const m of file.messages) {
            count++;
            console.log(`${file.filePath.replace(/.*client[\\/]/, "")}:${m.line} ${m.ruleId} ${m.message.split("\n")[0].slice(0, 140)}`);
        }
    }
    console.log(count ? `${count} problem(s)` : "No problems.");
});
