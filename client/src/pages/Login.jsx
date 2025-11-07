import React, { useState } from 'react';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

export default function LoginPage({ onLogin }) {
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState('');

	const handleSubmit = async (e) => {
		e.preventDefault();
		setError('');
		try {
			const res = await fetch(`${SOCKET_URL}/api/auth/login`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username, password })
			});
			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.message || 'Login failed');
			}
			const { token, user } = await res.json();
			localStorage.setItem('chatToken', token);
			localStorage.setItem('chatUser', JSON.stringify(user));
			if (onLogin) onLogin(user);
		} catch (err) {
			setError(err.message || 'Login error');
		}
	};

	return (
		<div className="login-page">
			<h2>Login</h2>
			{error && <div className="error">{error}</div>}
			<form onSubmit={handleSubmit}>
				<div>
					<input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
				</div>
				<div>
					<input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
				</div>
				<div>
					<button type="submit">Login</button>
				</div>
			</form>
		</div>
	);
}

