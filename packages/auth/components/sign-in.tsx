"use client";
import { useState } from "react";
import { signIn } from "../client";
export const SignIn = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await signIn.email({
          email,
          password,
        });
      }}
    >
      <input
        onChange={(e) => setEmail(e.target.value)}
        type="email"
        value={email}
      />
      <input
        onChange={(e) => setPassword(e.target.value)}
        type="password"
        value={password}
      />
      <button type="submit">Sign in</button>
    </form>
  );
};
