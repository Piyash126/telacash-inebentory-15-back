// ================= BACKEND (server.js) =================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const nodemailer = require('nodemailer'); // ⭐ Added
const { MongoClient, ObjectId, ServerApiVersion } = require('mongodb');
const admin = require('firebase-admin');
const { readFileSync } = require('fs');
if (!admin.apps.length) {
	admin.initializeApp({
		credential: admin.credential.cert(
			JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))
		),
	});
}

const app = express();
const port = process.env.PORT || 5000;

// ---------------- Middlewares ----------------
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads')); // Serve image files

// ---------------- MongoDB Setup ----------------
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tkzgfvq.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
	serverApi: {
		version: ServerApiVersion.v1,
		strict: true,
		deprecationErrors: true,
	},
});

// Collections
let userCollection,
	assetsCollection,
	assetsRequestCollection,
	purchasesCollection,
	// stocksCollection,
	vendorsCollection,
	categoriesCollection,
	subcategoriesCollection,
	brandsCollection;

async function run() {
	try {
		await client.connect();
		const db = client.db('inventoryDb');

		userCollection = db.collection('users');
		assetsCollection = db.collection('assets');
		assetsRequestCollection = db.collection('assets_request');
		purchasesCollection = db.collection('purchases');
		// stocksCollection = db.collection('stocks');
		vendorsCollection = db.collection('vendors');
		categoriesCollection = db.collection('categories');
		subcategoriesCollection = db.collection('subcategories');
		brandsCollection = db.collection('brands');

		console.log('MongoDB connected successfully!');
	} catch (err) {
		console.error(err);
	}
}
run().catch(console.dir());

// ---------------- MULTER Setup ----------------
const storage = multer.diskStorage({
	destination: (req, file, cb) => cb(null, 'uploads/'),
	filename: (req, file, cb) =>
		cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

// -------------------- Nodemailer Setup ----------------
const transporter = nodemailer.createTransport({
	service: 'gmail',
	auth: {
		user: process.env.EMAIL_USER,
		pass: process.env.EMAIL_PASS,
	},
});

app.get('/assets-request', async (req, res) => {
  try {
    const finalData = await assetsRequestCollection
      .aggregate([
        {
          $lookup: {
            from: 'users',
            localField: 'userEmail',
            foreignField: 'email',
            as: 'userInfo',
          },
        },
        {
          $lookup: {
            from: 'assets',
            localField: 'productId',
            foreignField: '_id',
            as: 'assetInfo',
          },
        },
        {
          $unwind: {
            path: '$userInfo',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $unwind: {
            path: '$assetInfo',
            preserveNullAndEmptyArrays: true,
          },
        },
      ])
      .toArray();

    res.send(finalData);
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Failed to load asset requests' });
  }
});





// ================= START SERVER =================
app.listen(port, () => console.log(`Server running on port ${port}`));

// full code
// ================= BACKEND (server.js) =================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const nodemailer = require('nodemailer'); // ⭐ Added
const { MongoClient, ObjectId, ServerApiVersion } = require('mongodb');
const admin = require('firebase-admin');
const { readFileSync } = require('fs');
if (!admin.apps.length) {
	admin.initializeApp({
		credential: admin.credential.cert(
			JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))
		),
	});
}

const app = express();
const port = process.env.PORT || 5000;

// ---------------- Middlewares ----------------
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads')); // Serve image files

// ---------------- MongoDB Setup ----------------
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tkzgfvq.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
	serverApi: {
		version: ServerApiVersion.v1,
		strict: true,
		deprecationErrors: true,
	},
});

// Collections
let userCollection,
	assetsCollection,
	assetsRequestCollection,
	purchasesCollection,
	// stocksCollection,
	vendorsCollection,
	categoriesCollection,
	subcategoriesCollection,
	brandsCollection;

async function run() {
	try {
		await client.connect();
		const db = client.db('inventoryDb');

		userCollection = db.collection('users');
		assetsCollection = db.collection('assets');
		assetsRequestCollection = db.collection('assets_request');
		purchasesCollection = db.collection('purchases');
		// stocksCollection = db.collection('stocks');
		vendorsCollection = db.collection('vendors');
		categoriesCollection = db.collection('categories');
		subcategoriesCollection = db.collection('subcategories');
		brandsCollection = db.collection('brands');

		console.log('MongoDB connected successfully!');
	} catch (err) {
		console.error(err);
	}
}
run().catch(console.dir());

// ---------------- MULTER Setup ----------------
const storage = multer.diskStorage({
	destination: (req, file, cb) => cb(null, 'uploads/'),
	filename: (req, file, cb) =>
		cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

// -------------------- Nodemailer Setup ----------------
const transporter = nodemailer.createTransport({
	service: 'gmail',
	auth: {
		user: process.env.EMAIL_USER,
		pass: process.env.EMAIL_PASS,
	},
});

// -------------------------------------------------------
// ===================== ROUTES ==========================
// -------------------------------------------------------

// ================= USERS =================

app.get('/users', async (req, res) => {
	const users = await userCollection.find().toArray();
	res.send({
		users,
	});
});

// this user crate only for admin [ never use others]
app.post('/users', upload.single('photo'), async (req, res) => {
	try {
		const { id, name, email, password, department, position, phone } = req.body;
		const photoPath = req.file ? req.file.filename : null;

		const existingUser = await userCollection.findOne({ email });
		if (existingUser) {
			return res.send({ message: 'User already exists', insertedId: null });
		}

		const user = await admin.auth().createUser({
			email,
			password,
			displayName: name || '',
		});

		const newUser = {
			id,
			name,
			email,
			role: 'office-user',
			photoPath,
			department,
			position,
			phone,
		};

		const result = await userCollection.insertOne(newUser);
		res.send({ insertedId: result.insertedId });
	} catch (err) {
		console.error('Error inserting user:', err);
		res.status(500).send({ message: err.message });
	}
});

app.delete('/users/:id', async (req, res) => {
	try {
		const { id } = req.params;
		const result = await userCollection.deleteOne({
			_id: new ObjectId(id),
		});

		if (result.deletedCount === 0) {
			return res.status(404).send({ message: 'user not found' });
		}

		res.send({ deletedCount: result.deletedCount });
	} catch (error) {
		console.error('Error deleting user:', error);
		res.status(500).send({ error: 'Failed to delete user' });
	}
});

app.get('/users/admin/:email', async (req, res) => {
	const email = req.params.email;
	const user = await userCollection.findOne({ email });
	const admin = user?.role === 'admin';
	res.send({ admin });
});

// ================= ASSET REQUEST =================
app.post('/assets-request', async (req, res) => {
	const item = req.body;
	const result = await assetsRequestCollection.insertOne({
		...item,
		productId: new ObjectId(item.productId),
		status: 'pending',
	});
	res.send(result);
});

app.get('/assets-request', async (req, res) => {
	try {
		const finalData = await assetsRequestCollection
			.aggregate([
				{
					$lookup: {
						from: 'users',
						localField: 'userEmail',
						foreignField: 'email',
						as: 'userInfo',
					},
				},
				{
					$lookup: {
						from: 'assets',
						localField: 'productId',
						foreignField: '_id',
						as: 'assetInfo',
					},
				},
				{
					$unwind: {
						path: '$userInfo',
						preserveNullAndEmptyArrays: true,
					},
				},
				{
					$unwind: {
						path: '$assetInfo',
						preserveNullAndEmptyArrays: true,
					},
				},
			])
			.toArray();

		res.send(finalData);
	} catch (err) {
		console.error(err);
		res.status(500).send({ error: 'Failed to load asset requests' });
	}
});

// assets get by user email
app.get('/assets-request/user/:email', async (req, res) => {
	const email = req.params.email;
	const requests = await assetsRequestCollection
		.find({ userEmail: email })
		.toArray();
	res.send(requests);
});

// ================= APPROVE ASSET REQUEST   =================
app.patch('/assets-request/approve/:id', async (req, res) => {
	const { id } = req.params;
	const { approvedBy } = req.body;

	try {
		const request = await assetsRequestCollection.findOne({
			_id: new ObjectId(id),
		});
		if (!request) return res.status(404).send({ message: 'Request not found' });

		const asset = await assetsCollection.findOne({
			_id: new ObjectId(request.productId),
		});
		if (!asset) return res.status(404).send({ message: 'Asset not found' });

		const updateResult = await assetsRequestCollection.updateOne(
			{ _id: new ObjectId(id) },
			{
				$set: {
					status: 'approved',
				},
			}
		);

		await assetsCollection.updateOne(
			{ _id: new ObjectId(request.productId) },
			{ $set: { quantity: asset.quantity - Number(request.quantity) } }
		);

		const user = await userCollection.findOne({ email: request.userEmail });

		if (user?.email) {
			await transporter.sendMail({
				from: process.env.EMAIL_USER,
				to: user.email,
				subject: 'Asset Request Approved',
				html: `
		  <p>Dear ${user.name},</p>
		  <p>Your asset request for <b>${request.category} - ${request.subcategory}</b> has been approved.</p>
		  <p>Quantity: ${request.quantity} ${request.unit}</p>
		  <p>Approved by: ${approvedBy}</p>
		  <p>Thank you!</p>
		`,
			});
		}

		res.send({ modifiedCount: updateResult.modifiedCount });
	} catch (error) {
		console.error(error);
		res.status(500).send({ message: 'Approval failed' });
	}
});

// ================= ADMIN CREATE AND APPROVE ASSET REQUEST =================
app.post('/assets-request/admin/create-and-approve', async (req, res) => {
	try {
		const {
			productId,
			userEmail,
			quantity,
			unit,
			category,
			subcategory,
			approvedBy,
		} = req.body;

		// Validate required fields
		if (!productId || !userEmail || !quantity || !approvedBy) {
			return res.status(400).send({
				message:
					'Missing required fields: productId, userEmail, quantity, approvedBy',
			});
		}

		// Check if asset exists
		const asset = await assetsCollection.findOne({
			_id: new ObjectId(productId),
		});
		if (!asset) {
			return res.status(404).send({ message: 'Asset not found' });
		}

		// Check if enough quantity is available
		if (asset.quantity < Number(quantity)) {
			return res
				.status(400)
				.send({ message: 'Insufficient quantity available' });
		}

		// Check if user exists
		const user = await userCollection.findOne({ email: userEmail });
		if (!user) {
			return res.status(404).send({ message: 'User not found' });
		}

		// Create request with approved status
		const newRequest = {
			productId: new ObjectId(productId),
			userEmail,
			quantity: Number(quantity),
			unit: unit || '',
			category: category || '',
			subcategory: subcategory || '',
			status: 'approved',
		};

		const result = await assetsRequestCollection.insertOne(newRequest);

		// Update asset quantity
		await assetsCollection.updateOne(
			{ _id: new ObjectId(productId) },
			{ $set: { quantity: asset.quantity - Number(quantity) } }
		);

		// Send email notification
		if (user.email) {
			await transporter.sendMail({
				from: process.env.EMAIL_USER,
				to: user.email,
				subject: 'Asset Request Approved',
				html: `
		  <p>Dear ${user.name},</p>
		  <p>An asset request has been created and approved for you.</p>
		  <p>Asset: <b>${category || 'N/A'} - ${subcategory || 'N/A'}</b></p>
		  <p>Quantity: ${quantity} ${unit || ''}</p>
		  <p>Approved by: ${approvedBy}</p>
		  <p>Thank you!</p>
		`,
			});
		}

		res.send({
			insertedId: result.insertedId,
			message: 'Request created and approved successfully',
		});
	} catch (error) {
		console.error(error);
		res.status(500).send({ message: 'Failed to create and approve request' });
	}
});

// ================= ASSETS =================
app.get('/assets', async (req, res) => {
	const result = await assetsCollection.find().toArray();
	res.send(result);
});

app.post('/assets', async (req, res) => {
	try {
		const item = req.body;
		const result = await assetsCollection.insertOne(item);
		res.send(result);
	} catch (error) {
		res.status(500).send({ error: 'Failed to insert asset' });
	}
});

app.get('/assets/:id', async (req, res) => {
	try {
		const { id } = req.params;
		const asset = await assetsCollection.findOne({
			_id: new ObjectId(id),
		});

		if (!asset) {
			return res.status(404).send({ message: 'Asset not found' });
		}

		res.send(asset);
	} catch (error) {
		console.error('Error fetching asset:', error);
		res.status(500).send({ error: 'Failed to fetch asset' });
	}
});

app.patch('/assets/:id', async (req, res) => {
	try {
		const { id } = req.params;
		const updateData = req.body;

		const result = await assetsCollection.updateOne(
			{ _id: new ObjectId(id) },
			{ $set: updateData }
		);

		if (result.matchedCount === 0) {
			return res.status(404).send({ message: 'Asset not found' });
		}

		res.send({ modifiedCount: result.modifiedCount });
	} catch (error) {
		console.error('Error updating asset:', error);
		res.status(500).send({ error: 'Failed to update asset' });
	}
});

app.delete('/assets/:id', async (req, res) => {
	try {
		const { id } = req.params;
		const result = await assetsCollection.deleteOne({
			_id: new ObjectId(id),
		});

		if (result.deletedCount === 0) {
			return res.status(404).send({ message: 'Asset not found' });
		}

		res.send({ deletedCount: result.deletedCount });
	} catch (error) {
		console.error('Error deleting asset:', error);
		res.status(500).send({ error: 'Failed to delete asset' });
	}
});

// ================= PURCHASE (purchases) =================
app.post('/purchases', async (req, res) => {
	try {
		const item = req.body;
		item.createdAt = new Date();

		// Update asset quantities
		if (item.items && Array.isArray(item.items)) {
			for (const purchaseItem of item.items) {
				if (purchaseItem.productName && purchaseItem.qty) {
					await assetsCollection.updateOne(
						{ _id: new ObjectId(purchaseItem.productName) },
						{ $inc: { quantity: Number(purchaseItem.qty) } }
					);
				}
			}
		}

		const addedResult = await purchasesCollection.insertOne(item);
		res.send({ insertedId: addedResult.insertedId });
	} catch (error) {
		console.error('Error creating purchase:', error);
		res.status(500).send({ error: 'Insertion failed' });
	}
});

app.get('/purchases', async (req, res) => {
	try {
		const purchases = await purchasesCollection.find().toArray();
		res.send(purchases);
	} catch (error) {
		console.error('Error fetching purchases:', error);
		res.status(500).send({ error: 'Failed to fetch purchases' });
	}
});

app.get('/purchases/:id', async (req, res) => {
	try {
		const { id } = req.params;
		const purchase = await purchasesCollection.findOne({
			_id: new ObjectId(id),
		});

		if (!purchase) {
			return res.status(404).send({ message: 'Purchase not found' });
		}

		res.send(purchase);
	} catch (error) {
		console.error('Error fetching purchase:', error);
		res.status(500).send({ error: 'Failed to fetch purchase' });
	}
});

app.patch('/purchases/:id', async (req, res) => {
	try {
		const { id } = req.params;
		const updateData = req.body;

		// Get the old purchase to calculate quantity differences
		const oldPurchase = await purchasesCollection.findOne({
			_id: new ObjectId(id),
		});

		if (!oldPurchase) {
			return res.status(404).send({ message: 'Purchase not found' });
		}

		// If items are being updated, adjust asset quantities
		if (updateData.items && Array.isArray(updateData.items)) {
			// First, revert old quantities
			if (oldPurchase.items && Array.isArray(oldPurchase.items)) {
				for (const oldItem of oldPurchase.items) {
					if (oldItem.productName && oldItem.qty) {
						await assetsCollection.updateOne(
							{ _id: new ObjectId(oldItem.productName) },
							{ $inc: { quantity: -Number(oldItem.qty) } }
						);
					}
				}
			}

			// Then, add new quantities
			for (const newItem of updateData.items) {
				if (newItem.productName && newItem.qty) {
					await assetsCollection.updateOne(
						{ _id: new ObjectId(newItem.productName) },
						{ $inc: { quantity: Number(newItem.qty) } }
					);
				}
			}
		}

		updateData.updatedAt = new Date();

		const result = await purchasesCollection.updateOne(
			{ _id: new ObjectId(id) },
			{ $set: updateData }
		);

		res.send({ modifiedCount: result.modifiedCount });
	} catch (error) {
		console.error('Error updating purchase:', error);
		res.status(500).send({ error: 'Failed to update purchase' });
	}
});

app.delete('/purchases/:id', async (req, res) => {
	try {
		const { id } = req.params;

		// Get the purchase before deleting to revert quantities
		const purchase = await purchasesCollection.findOne({
			_id: new ObjectId(id),
		});

		if (!purchase) {
			return res.status(404).send({ message: 'Purchase not found' });
		}

		// Revert asset quantities
		if (purchase.items && Array.isArray(purchase.items)) {
			for (const purchaseItem of purchase.items) {
				if (purchaseItem.productName && purchaseItem.qty) {
					await assetsCollection.updateOne(
						{ _id: new ObjectId(purchaseItem.productName) },
						{ $inc: { quantity: -Number(purchaseItem.qty) } }
					);
				}
			}
		}

		const result = await purchasesCollection.deleteOne({
			_id: new ObjectId(id),
		});

		res.send({ deletedCount: result.deletedCount });
	} catch (error) {
		console.error('Error deleting purchase:', error);
		res.status(500).send({ error: 'Failed to delete purchase' });
	}
});

// ================= USER PROFILE =================
app.get('/userProfile/:email', async (req, res) => {
	const email = req.params.email;

	try {
		const profile = await userCollection.findOne({ email });

		if (!profile) {
			return res.send({ profile: null, assignedAssets: [] });
		}

		const assignedAssets = await assetsCollection
			.find({ assignedToEmail: email })
			.toArray();

		res.send({ profile, assignedAssets });
	} catch (err) {
		res.status(500).send({ error: 'Failed to load user profile' });
	}
});

// ================= ROOT ROUTE =================
app.get('/', (req, res) => {
	res.send('Office Inventory API Running!');
});

// ================= VENDOR CRUD =================
// Create Vendor
app.post('/vendors', async (req, res) => {
	try {
		const { name, status, companyName, phone, email, address } = req.body;

		const vendorData = {};
		if (name !== undefined) vendorData.name = name;
		if (status !== undefined) vendorData.status = status;
		if (companyName !== undefined) vendorData.companyName = companyName;
		if (phone !== undefined) vendorData.phone = phone;
		if (email !== undefined) vendorData.email = email;
		if (address !== undefined) vendorData.address = address;

		vendorData.createdAt = new Date();

		const result = await vendorsCollection.insertOne(vendorData);
		res.send({ insertedId: result.insertedId });
	} catch (error) {
		console.error('Error creating vendor:', error);
		res.status(500).send({ error: 'Failed to create vendor' });
	}
});

// Get All Vendors
app.get('/vendors', async (req, res) => {
	try {
		const vendors = await vendorsCollection.find().toArray();
		res.send(vendors);
	} catch (error) {
		console.error('Error fetching vendors:', error);
		res.status(500).send({ error: 'Failed to fetch vendors' });
	}
});

// Get Single Vendor by ID
app.get('/vendors/:id', async (req, res) => {
	try {
		const { id } = req.params;
		const vendor = await vendorsCollection.findOne({
			_id: new ObjectId(id),
		});

		if (!vendor) {
			return res.status(404).send({ message: 'Vendor not found' });
		}

		res.send(vendor);
	} catch (error) {
		console.error('Error fetching vendor:', error);
		res.status(500).send({ error: 'Failed to fetch vendor' });
	}
});

// Update Vendor
app.patch('/vendors/:id', async (req, res) => {
	try {
		const { id } = req.params;
		const { name, status, companyName, phone, email, address } = req.body;

		const updateData = {};
		if (name !== undefined) updateData.name = name;
		if (status !== undefined) updateData.status = status;
		if (companyName !== undefined) updateData.companyName = companyName;
		if (phone !== undefined) updateData.phone = phone;
		if (email !== undefined) updateData.email = email;
		if (address !== undefined) updateData.address = address;

		updateData.updatedAt = new Date();

		const result = await vendorsCollection.updateOne(
			{ _id: new ObjectId(id) },
			{ $set: updateData }
		);

		if (result.matchedCount === 0) {
			return res.status(404).send({ message: 'Vendor not found' });
		}

		res.send({ modifiedCount: result.modifiedCount });
	} catch (error) {
		console.error('Error updating vendor:', error);
		res.status(500).send({ error: 'Failed to update vendor' });
	}
});

// Delete Vendor
app.delete('/vendors/:id', async (req, res) => {
	try {
		const { id } = req.params;
		const result = await vendorsCollection.deleteOne({
			_id: new ObjectId(id),
		});

		if (result.deletedCount === 0) {
			return res.status(404).send({ message: 'Vendor not found' });
		}

		res.send({ deletedCount: result.deletedCount });
	} catch (error) {
		console.error('Error deleting vendor:', error);
		res.status(500).send({ error: 'Failed to delete vendor' });
	}
});

// ================= CATEGORY CRUD =================
// Create Category
app.post('/categories', async (req, res) => {
	try {
		const categoryData = req.body;
		categoryData.createdAt = new Date();

		const result = await categoriesCollection.insertOne(categoryData);
		res.send({ insertedId: result.insertedId });
	} catch (error) {
		console.error('Error creating category:', error);
		res.status(500).send({ error: 'Failed to create category' });
	}
});

// Get All Categories
app.get('/categories', async (req, res) => {
	try {
		const categories = await categoriesCollection.find().toArray();
		res.send(categories);
	} catch (error) {
		console.error('Error fetching categories:', error);
		res.status(500).send({ error: 'Failed to fetch categories' });
	}
});

// Get Single Category by ID
app.get('/categories/:id', async (req, res) => {
	try {
		const { id } = req.params;
		const category = await categoriesCollection.findOne({
			_id: new ObjectId(id),
		});

		if (!category) {
			return res.status(404).send({ message: 'Category not found' });
		}

		res.send(category);
	} catch (error) {
		console.error('Error fetching category:', error);
		res.status(500).send({ error: 'Failed to fetch category' });
	}
});

// Update Category
app.patch('/categories/:id', async (req, res) => {
	try {
		const { id } = req.params;
		const updateData = req.body;
		updateData.updatedAt = new Date();

		const result = await categoriesCollection.updateOne(
			{ _id: new ObjectId(id) },
			{ $set: updateData }
		);

		if (result.matchedCount === 0) {
			return res.status(404).send({ message: 'Category not found' });
		}

		res.send({ modifiedCount: result.modifiedCount });
	} catch (error) {
		console.error('Error updating category:', error);
		res.status(500).send({ error: 'Failed to update category' });
	}
});

// Delete Category
app.delete('/categories/:id', async (req, res) => {
	try {
		const { id } = req.params;
		const result = await categoriesCollection.deleteOne({
			_id: new ObjectId(id),
		});

		if (result.deletedCount === 0) {
			return res.status(404).send({ message: 'Category not found' });
		}

		res.send({ deletedCount: result.deletedCount });
	} catch (error) {
		console.error('Error deleting category:', error);
		res.status(500).send({ error: 'Failed to delete category' });
	}
});

// ================= SUBCATEGORY CRUD =================
// Create Subcategory
app.post('/subcategories', async (req, res) => {
	try {
		const subcategoryData = req.body;
		subcategoryData.createdAt = new Date();

		const result = await subcategoriesCollection.insertOne(subcategoryData);
		res.send({ insertedId: result.insertedId });
	} catch (error) {
		console.error('Error creating subcategory:', error);
		res.status(500).send({ error: 'Failed to create subcategory' });
	}
});

// Get All Subcategories
app.get('/subcategories', async (req, res) => {
	try {
		const subcategories = await subcategoriesCollection.find().toArray();
		res.send(subcategories);
	} catch (error) {
		console.error('Error fetching subcategories:', error);
		res.status(500).send({ error: 'Failed to fetch subcategories' });
	}
});

// Get Single Subcategory by ID
app.get('/subcategories/:id', async (req, res) => {
	try {
		const { id } = req.params;
		const subcategory = await subcategoriesCollection.findOne({
			_id: new ObjectId(id),
		});

		if (!subcategory) {
			return res.status(404).send({ message: 'Subcategory not found' });
		}

		res.send(subcategory);
	} catch (error) {
		console.error('Error fetching subcategory:', error);
		res.status(500).send({ error: 'Failed to fetch subcategory' });
	}
});

// Update Subcategory
app.patch('/subcategories/:id', async (req, res) => {
	try {
		const { id } = req.params;
		const updateData = req.body;
		updateData.updatedAt = new Date();

		const result = await subcategoriesCollection.updateOne(
			{ _id: new ObjectId(id) },
			{ $set: updateData }
		);

		if (result.matchedCount === 0) {
			return res.status(404).send({ message: 'Subcategory not found' });
		}

		res.send({ modifiedCount: result.modifiedCount });
	} catch (error) {
		console.error('Error updating subcategory:', error);
		res.status(500).send({ error: 'Failed to update subcategory' });
	}
});

// Delete Subcategory
app.delete('/subcategories/:id', async (req, res) => {
	try {
		const { id } = req.params;
		const result = await subcategoriesCollection.deleteOne({
			_id: new ObjectId(id),
		});

		if (result.deletedCount === 0) {
			return res.status(404).send({ message: 'Subcategory not found' });
		}

		res.send({ deletedCount: result.deletedCount });
	} catch (error) {
		console.error('Error deleting subcategory:', error);
		res.status(500).send({ error: 'Failed to delete subcategory' });
	}
});

// ================= BRAND CRUD =================
// Create Brand
app.post('/brands', async (req, res) => {
	try {
		const brandData = req.body;
		brandData.createdAt = new Date();

		const result = await brandsCollection.insertOne(brandData);
		res.send({ insertedId: result.insertedId });
	} catch (error) {
		console.error('Error creating brand:', error);
		res.status(500).send({ error: 'Failed to create brand' });
	}
});

// Get All Brands
app.get('/brands', async (req, res) => {
	try {
		const brands = await brandsCollection.find().toArray();
		res.send(brands);
	} catch (error) {
		console.error('Error fetching brands:', error);
		res.status(500).send({ error: 'Failed to fetch brands' });
	}
});

// Get Single Brand by ID
app.get('/brands/:id', async (req, res) => {
	try {
		const { id } = req.params;
		const brand = await brandsCollection.findOne({
			_id: new ObjectId(id),
		});

		if (!brand) {
			return res.status(404).send({ message: 'Brand not found' });
		}

		res.send(brand);
	} catch (error) {
		console.error('Error fetching brand:', error);
		res.status(500).send({ error: 'Failed to fetch brand' });
	}
});

// Update Brand
app.patch('/brands/:id', async (req, res) => {
	try {
		const { id } = req.params;
		const updateData = req.body;
		updateData.updatedAt = new Date();

		const result = await brandsCollection.updateOne(
			{ _id: new ObjectId(id) },
			{ $set: updateData }
		);

		if (result.matchedCount === 0) {
			return res.status(404).send({ message: 'Brand not found' });
		}

		res.send({ modifiedCount: result.modifiedCount });
	} catch (error) {
		console.error('Error updating brand:', error);
		res.status(500).send({ error: 'Failed to update brand' });
	}
});

// Delete Brand
app.delete('/brands/:id', async (req, res) => {
	try {
		const { id } = req.params;
		const result = await brandsCollection.deleteOne({
			_id: new ObjectId(id),
		});

		if (result.deletedCount === 0) {
			return res.status(404).send({ message: 'Brand not found' });
		}

		res.send({ deletedCount: result.deletedCount });
	} catch (error) {
		console.error('Error deleting brand:', error);
		res.status(500).send({ error: 'Failed to delete brand' });
	}
});

// Dashboard
app.get('/dashboard-statics', async (req, res) => {
	try {
		// ===== 1. SUM ALL QUANTITY FROM assetsCollection =====
		const quantityResult = await assetsCollection
			.aggregate([
				{
					$group: {
						_id: null,
						totalQuantity: { $sum: { $toInt: '$quantity' } },
					},
				},
			])
			.toArray();

		const totalQuantity = quantityResult[0]?.totalQuantity || 0;

		// ===== 2. COUNT ASSET REQUESTS =====
		const approvedCount = await assetsRequestCollection.countDocuments({
			status: 'approved',
		});
		const pendingCount = await assetsRequestCollection.countDocuments({
			status: 'pending',
		});

		// ===== 3. SUM purchasePrice & dueAmount FROM purchasesCollection =====
		const purchaseResult = await purchasesCollection
			.aggregate([
				{
					$group: {
						_id: null,
						totalPurchasePrice: { $sum: '$purchasePrice' },
						totalDueAmount: { $sum: '$dueAmount' },
					},
				},
			])
			.toArray();

		const totalPurchasePrice = purchaseResult[0]?.totalPurchasePrice || 0;
		const totalDueAmount = purchaseResult[0]?.totalDueAmount || 0;

		// ===== FINAL RESPONSE =====
		res.send({
			totalQuantity,
			approvedCount,
			pendingCount,
			totalPurchasePrice,
			totalDueAmount,
		});
	} catch (error) {
		console.error('Dashboard statics error:', error);
		res.status(500).send({ error: 'Failed to load dashboard statics' });
	}
});

// ================= START SERVER =================
app.listen(port, () => console.log(`Server running on port ${port}`));

