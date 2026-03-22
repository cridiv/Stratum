'use client';

import SignUp from './SignUp';
import React, { useState } from 'react';

const Page = () => {
  const [isSignUpOpen, setIsSignUpOpen] = useState(true);

  const handleCloseSignUp = () => {
    setIsSignUpOpen(false);
  };

  return (
    <>
      <SignUp isOpen={isSignUpOpen} onClose={handleCloseSignUp} />
    </>
  );
};

export default Page;