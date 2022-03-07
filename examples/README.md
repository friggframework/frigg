# Introduction

Frigg Defintion:

- Frigg \*\*\*\*is the Norse goddess of **marriage** and **partnerships**
- Frigg means **“Beloved”** in Old Norse
- She flies the earthly skies as a falcon
- She is known in folklore as the **“weaver of the clouds”**

The Frigg Integration Framework powers integrations between software companies, the majority of which are in the cloud, speeding up time to live on tech partnerships.

## Instructions

### Backend

Run the server:

```
cd backend
npm install
npm run start:dev
```

Run tests:

```
cd backend
npm run test
```

### Frontend

Run the server:

Rename `.env.example` to `.env`

```
npm install
npm run start
```

## Attentive

**Connecting to Attentive**

1. [https://www.dropbox.com/s/9cy1d5dn72lgzl3/Screen%20Recording%202022-03-04%20at%2003.10.42%20PM.mp4?dl=0](https://www.dropbox.com/s/9cy1d5dn72lgzl3/Screen%20Recording%202022-03-04%20at%2003.10.42%20PM.mp4?dl=0)

**Attentive API Postman Collection**

1. [https://documenter.getpostman.com/view/19682278/UVsEU8sS#0ae4577c-8026-47cb-8f6f-7cea99ac11a3](https://documenter.getpostman.com/view/19682278/UVsEU8sS#0ae4577c-8026-47cb-8f6f-7cea99ac11a3)

**Notes on ideal additional frontend refactor and work as outlined in point 4 (via whatever method you think delivers the concepts the best).**

1. Consider refactoring all class components to functional components, managing all state using hooks and Redux.
2. Consider separating routes from App.js file
3. _More things to do_
   1. Create functionality for filtering integrations by category
   2. Create search functionality for searching integrations
   3. Create integration level configuration options
   4. Update design for modal, migrate from bootstrap to tailwind
   5. Update integration redirect screen to show integration information after a loading state
   6. Update screen for getting sample data, migrate from bootstrap to tailwind
   7. Create more toast components for validations and notifications throughout the app

**How might Left Hook improve the Framework or its documentation to enable faster development and contribution by any Node.js developer?**

1. Create documentaion for each Integration module
2. Modularize Integrations into their own folders, move integration managers and handlers into their respective integration folder
