import React from 'react';
import { Link } from 'react-router-dom';

const NotFoundPage = () => {
  return (
    <div className="text-center mt-5">
      <h2>Page Not Found</h2>
      <p>The page you are looking for doesn't exist or has been moved.</p>
      <Link to="/" className="btn btn-primary mt-3">Go to Dashboard</Link>
    </div>
  );
};

export default NotFoundPage;