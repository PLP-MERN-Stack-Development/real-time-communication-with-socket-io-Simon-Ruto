import React, { useState } from 'react';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

export default function RegisterPage({ onRegister }) {
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState('');
	const [success, setSuccess] = useState('');

	const handleSubmit = async (e) => {
		e.preventDefault();
		setError('');
		setSuccess('');
		try {
			const res = await fetch(`${SOCKET_URL}/api/auth/register`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username, password })
			});
			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.message || 'Registration failed');
			}
			const { token, user } = await res.json();
			localStorage.setItem('chatToken', token);
			localStorage.setItem('chatUser', JSON.stringify(user));
			setSuccess('Registered and logged in');
			if (onRegister) onRegister(user);
		} catch (err) {
			setError(err.message || 'Register error');
		}
	};

	return (
		<div className="register-page">
			<h2>Register</h2>
			{error && <div className="error">{error}</div>}
			{success && <div className="success">{success}</div>}
			<form onSubmit={handleSubmit}>
				<div>
					<input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
				</div>
				<div>
					<input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
				</div>
				<div>
					<button type="submit">Register</button>
				</div>
			</form>
		</div>
	);
}

