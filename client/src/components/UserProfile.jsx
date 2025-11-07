import React, { useEffect, useState } from 'react';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

export default function UserProfile({ onUpdated }) {
	const [profile, setProfile] = useState(null);
	const [username, setUsername] = useState('');
	const [profileImage, setProfileImage] = useState(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');

	const token = localStorage.getItem('chatToken');

	useEffect(() => {
		if (!token) return;
		fetchProfile();
	}, [token]);

	const fetchProfile = async () => {
		try {
			setLoading(true);
			const res = await fetch(`${SOCKET_URL}/api/auth/profile`, {
				headers: { Authorization: `Bearer ${token}` }
			});
			if (!res.ok) throw new Error('Failed to fetch profile');
			const data = await res.json();
			setProfile(data.user);
			setUsername(data.user.username || '');
			setProfileImage(data.user.profileImage || null);
		} catch (err) {
			setError(err.message || 'Error');
		} finally {
			setLoading(false);
		}
	};

	const handleImage = (file) => {
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => setProfileImage(reader.result);
		reader.readAsDataURL(file);
	};

	const handleSave = async () => {
		try {
			setLoading(true);
			const res = await fetch(`${SOCKET_URL}/api/auth/profile`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
				body: JSON.stringify({ username, profileImage })
			});
			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.message || 'Failed to save');
			}
			const updated = await res.json();
			localStorage.setItem('chatUser', JSON.stringify({ id: updated.id, username: updated.username, profileImage: updated.profileImage }));
			if (onUpdated) onUpdated(updated);
			alert('Profile updated');
		} catch (err) {
			setError(err.message || 'Save error');
		} finally {
			setLoading(false);
		}
	};

	if (!token) return <div>Please log in to edit profile</div>;
	if (loading) return <div>Loading...</div>;

	return (
		<div className="user-profile">
			{error && <div className="error">{error}</div>}
			<h3>Profile</h3>
			<div>
				<label>Display name</label>
				<input value={username} onChange={(e) => setUsername(e.target.value)} />
			</div>
			<div>
				<label>Profile image</label>
				<div>
					{profileImage ? (
						<img src={profileImage} alt="avatar" style={{ width: 80, height: 80, borderRadius: 40 }} />
					) : (
						<div style={{ width: 80, height: 80, borderRadius: 40, background: '#ccc' }} />
					)}
				</div>
				<input type="file" accept="image/*" onChange={(e) => handleImage(e.target.files?.[0])} />
			</div>
			<div>
				<button onClick={handleSave}>Save</button>
			</div>
		</div>
	);
}

