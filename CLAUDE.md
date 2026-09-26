# Project Rules

## Technology

- Phaser 4
- TypeScript
- Vite

## Code Style

- Prefer TypeScript types over `any`
- Keep systems modular
- Don't put everything into one Scene
- Don't introduce dependencies without asking
- Don't rewrite working systems unnecessarily
- Make code easy for me to tweak and finetune the specifics, such as swapping out assets and moving UI.
- Make variable and function names as descriptive as possible without overly extending the name length. 
- Always use camel-case for variable names, and pascal case for functions and classes.
- Use event architecture when you see fit. 

## Development

- Run the project with `npm run dev`
- Don't delete existing functionality without explaining why
- Before making major architectural changes, explain the approach
- Do not ai generate any art or sounds. Ask me for the files to implement directly.
- Keep related systems together in files, do not mix and match things such as UI and character control.

## Game

This is a browser based game where you have a kitten avatar with it's own island. The game allows you to write down your goals and create helpful items such as to-do lists in order to improve your mental health and achieve your goals in the real world. To motivate users, they will be rewarded for staying consistent and achieving their goals by earning coins that can be used for their island. The kitten avatar is not supposed to be the player itself, so they don't have any control over it unless specific actions are performed. Their kitten avatar also expresses their mood based on how the user is performing in their goals and consistency. The game visual style is pixel art where sprites will be hand drawn. The ui however, wont be pixel art. The UI is where the majority of the player statistics, goals, and progress will be. The shop is a place where you can buy furniture and accessories for your character and island with the coins you have earned. There will be plans to add a form of multiplayer where you can add friends, create accounts, and encourage each other to achieve your goals. For any features you add that doesn't sound like it aligns with this game vision, consult me.