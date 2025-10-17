import readline from "readline";

export const askUserForConfirmation = (prompt: string): Promise<boolean> => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${prompt} (y/N) `, (answer) => {
      rl.close();
      const lowercasedAnswer = answer.toLowerCase();
      resolve(lowercasedAnswer === "y" || lowercasedAnswer === "yes");
    });
  });
};
