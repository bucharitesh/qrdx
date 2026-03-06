"use client";
import { useState } from "react";
import { signUp } from "../client";
export const SignUp = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await signUp.email({
          email,
          password,
          name,
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
      <input
        onChange={(e) => setName(e.target.value)}
        type="text"
        value={name}
      />
      <button type="submit">Sign up</button>
    </form>
  );
};
