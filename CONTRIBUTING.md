# Contributing to QRdx

Thank you for your interest in contributing to QRdx! We appreciate your support and look forward to your contributions. This guide will help you understand the directory structure and provide detailed instructions on how to contribute to QRdx.

Once done, open a pull request from your forked repo to the main repo [here](https://github.com/bucharitesh/qrdx/compare).

## Getting Started

### Fork and Clone the Repository

1. **Fork this repository**  
   Click [here](https://github.com/bucharitesh/qrdx/fork) to fork the repository.

2. **Clone your forked repository to your local machine**

   ```bash
   git clone https://github.com/<YOUR_USERNAME>/qrdx.git
   ```

3. **Navigate to the project directory**

   ```bash
   cd qrdx
   ```

4. **Create a new branch for your changes**

   ```bash
   git checkout -b my-new-branch
   ```

5. **Install dependencies**

   ```bash
   pnpm i
   ```

6. **Create a `.env.local` file**

   ```bash
   touch .env.local && echo "NEXT_PUBLIC_APP_URL=http://localhost:3000" > .env.local
   ```

7. **Run the project**
   ```bash
   pnpm dev
   ```

## Ask for Help

For any help or questions, please open a new GitHub issue.