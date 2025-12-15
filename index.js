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
                // NEW LOOKUP → approvedBy user details
                {
                    $lookup: {
                        from: 'users',
                        localField: 'approvedBy',
                        foreignField: 'email',
                        as: 'approvedByInfo',
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
                {
                    $unwind: {
                        path: '$approvedByInfo',
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

// get details about assets 
// get details about assets 
app.get('/user/assets/details/:email', async (req, res) => {
    try {
        const email = req.params.email;

        // 1. Get user info
        const user = await userCollection.findOne({ email });

        if (!user) {
            return res.status(404).send({ message: "User not found" });
        }

        // 2. Get asset requests for this user
        const assetRequests = await assetsRequestCollection
            .find({ userEmail: email })
            .toArray();

        // 3. Include approvedBy user info (if needed)
        const populatedRequests = await Promise.all(
            assetRequests.map(async (reqItem) => {
                if (reqItem.approvedBy) {
                    const approver = await userCollection.findOne({
                        email: reqItem.approvedBy,
                    });

                    return {
                        ...reqItem,
                        approverDetails: approver || null,
                    };
                }
                return reqItem;
            })
        );

        return res.send({
            user,
            assetRequests: populatedRequests,
        });

    } catch (error) {
        console.error("Error:", error);
        res.status(500).send({ message: "Internal server error" });
    }
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
// app.post("/assets-request/admin/create-and-approve", async (req, res) => {
//   const data = req.body;

//   try {
//     const requestData = {
//       ...data,
//       approvedBy: data.approvedBy?.trim().toLowerCase() || null,
//       userEmail: data.userEmail?.trim().toLowerCase() || null,
//       requestDate: new Date().toISOString(),
//       sentDate: new Date().toISOString(),
//       status: "approved",
//       sentByAdmin: true,
//     };

//     // Insert into DB
//     const result = await assetsRequestCollection.insertOne(requestData);

//     // Fetch user info
//     const user = await userCollection.findOne({ email: requestData.userEmail });

//     // Send email
//     if (user?.email) {
//       await transporter.sendMail({
//         from: process.env.EMAIL_USER,
//         to: user.email,
//         subject: "Asset Sent by Admin",
//         html: `
//           <p>Dear ${user.name},</p>
//           <p>You have been sent the asset directly by Admin.</p>
//           <p><b>Asset:</b> ${requestData.productName}</p>
//           <p><b>Quantity:</b> ${requestData.quantity}</p>
//           <p><b>Approved By:</b> ${requestData.approvedBy}</p>
//           <p>Thank you!</p>
//         `,
//       });
//     }

//     res.send({ insertedId: result.insertedId });
//   } catch (err) {
//     console.error(err);
//     res.status(500).send({ message: "Failed to create and approve request" });
//   }
// });
app.post("/assets-request/admin/create-and-approve", async (req, res) => {
  const data = req.body;

  try {
    const requestData = {
      ...data,
      productId: data.productId?.toString() || null,          // <-- ensure saved
      productName: data.productName?.trim() || "Unnamed Asset", // <-- ensure saved
      approvedBy: data.approvedBy?.trim().toLowerCase() || null,
      userEmail: data.userEmail?.trim().toLowerCase() || null,
      requestDate: new Date().toISOString(),
      sentDate: new Date().toISOString(),
      status: "approved",
      sentByAdmin: true,
    };

    // Insert into DB
    const result = await assetsRequestCollection.insertOne(requestData);

    // Fetch user info
    const user = await userCollection.findOne({ email: requestData.userEmail });

    // Send email
    if (user?.email) {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: user.email,
        subject: "Asset Sent by Admin",
        html: `
          <p>Dear ${user.name},</p>
          <p>You have been sent the asset directly by Admin.</p>
          <p><b>Asset:</b> ${requestData.productName}</p>
          <p><b>Quantity:</b> ${requestData.quantity}</p>
          <p><b>Approved By:</b> ${requestData.approvedBy}</p>
          <p>Thank you!</p>
        `,
      });
    }

    res.send({ insertedId: result.insertedId });
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to create and approve request" });
  }
});


// app.patch('/assets-request/status/:id', async (req, res) => {
//   const id = req.params.id;
//   const { status, updatedBy } = req.body;

//   try {
//     const result = await assetsRequestCollection.updateOne(
//       { _id: new ObjectId(id) },
//       {
//         $set: {
//           status: status,          // pending / approved / rejected
//           updatedBy: updatedBy,    // admin email
//           updatedAt: new Date()
//         }
//       }
//     );

//     res.send(result);
//   } catch (error) {
//     res.status(500).send({ message: "Failed to update status" });
//   }
// });


// ================= ASSETS =================
// app.patch('/assets-request/status/:id', async (req, res) => {
//   const id = req.params.id;
//   const { status, updatedBy } = req.body;

//   try {

//     const request = await assetsRequestCollection.findOne({
//       _id: new ObjectId(id)
//     });

//     if (!request) {
//       return res.status(404).send({ message: "Request not found" });
//     }

//     // ======================
//     // ⭐ APPROVE case handle
//     // ======================
//     if (status === "approved") {
//       const asset = await assetsCollection.findOne({
//         _id: new ObjectId(request.productId)
//       });

//       if (!asset) {
//         return res.status(404).send({ message: "Asset not found" });
//       }

//       // Stock update
//       await assetsCollection.updateOne(
//         { _id: new ObjectId(request.productId) },
//         { $set: { quantity: asset.quantity - Number(request.quantity) } }
//       );

//       // Email send
//       const user = await userCollection.findOne({
//         email: request.userEmail
//       });

//       if (user?.email) {
//         await transporter.sendMail({
//           from: process.env.EMAIL_USER,
//           to: user.email,
//           subject: "Asset Request Approved",
//           html: `
//             <p>Dear ${user.name},</p>
//             <p>Your asset request for <b>${request.category || request.productName}</b> has been approved.</p>
//             <p>Quantity: ${request.quantity}</p>
//             <p>Approved by: ${updatedBy}</p>
//           `
//         });
//       }
//     }

//     // ===================================
//     // ⭐ Reject / Pending — just update
//     // ===================================
//     const result = await assetsRequestCollection.updateOne(
//       { _id: new ObjectId(id) },
//       {
//         $set: {
//           status,
//           updatedBy,
//           updatedAt: new Date()
//         }
//       }
//     );

//     res.send(result);

//   } catch (error) {
//     console.error(error);
//     res.status(500).send({ message: "Failed to update status" });
//   }
// });

// ================= APPROVE / CHANGE STATUS =================
// app.patch("/assets-request/status/:id", async (req, res) => {
//   const { id } = req.params;
//   const { status, approvedBy } = req.body; // frontend থেকে approvedBy পাঠানো হচ্ছে

//   try {
//     // 1️⃣ Request খুঁজে বের করা
//     const request = await assetsRequestCollection.findOne({
//       _id: new ObjectId(id),
//     });
//     if (!request) return res.status(404).send({ message: "Request not found" });

//     // 2️⃣ যদি approve হয়, asset quantity update করা
//     if (status === "approved") {
//       const asset = await assetsCollection.findOne({
//         _id: new ObjectId(request.productId),
//       });
//       if (!asset) return res.status(404).send({ message: "Asset not found" });

//       await assetsCollection.updateOne(
//         { _id: new ObjectId(request.productId) },
//         { $inc: { quantity: -Number(request.quantity) } } // quantity কমানো
//       );
//     }

//     // 3️⃣ Request update করা (status + approvedBy)
//     const updateResult = await assetsRequestCollection.updateOne(
//       { _id: new ObjectId(id) },
//       { $set: { status, approvedBy } } // ✅ approvedBy save হচ্ছে
//     );

//     // 4️⃣ Email notification (optional)
//     const user = await userCollection.findOne({ email: request.userEmail });
//     if (status === "approved" && user?.email) {
//       await transporter.sendMail({
//         from: process.env.EMAIL_USER,
//         to: user.email,
//         subject: "Asset Request Approved",
//         html: `
//           <p>Dear ${user.name},</p>
//           <p>Your asset request for <b>${request.assetName || request.productName}</b> has been approved.</p>
//           <p>Quantity: ${request.quantity}</p>
//           <p>Approved by: ${approvedBy}</p>
//           <p>Thank you!</p>
//         `,
//       });
//     }

//     res.send({ modifiedCount: updateResult.modifiedCount });
//   } catch (err) {
//     console.error(err);
//     res.status(500).send({ message: "Failed to update request" });
//   }
// });


// ==================== ASSETS ====================

// app.patch("/assets-request/status/:id", async (req, res) => {
//   const { id } = req.params;
//   const { status, approvedBy } = req.body; // frontend থেকে আসছে

//   try {
//     const request = await assetsRequestCollection.findOne({ _id: new ObjectId(id) });
//     if (!request) return res.status(404).send({ message: "Request not found" });

//     // যদি approved হয়, asset quantity update
//     if (status === "approved") {
//       const asset = await assetsCollection.findOne({ _id: new ObjectId(request.productId) });
//       if (!asset) return res.status(404).send({ message: "Asset not found" });

//       await assetsCollection.updateOne(
//         { _id: new ObjectId(request.productId) },
//         { $inc: { quantity: -Number(request.quantity) } }
//       );
//     }

//     // ✅ approvedBy trim করা, old data overwrite না করে ঠিকভাবে update
//     const updateResult = await assetsRequestCollection.updateOne(
//       { _id: new ObjectId(id) },
//       { $set: { status, approvedBy: approvedBy?.trim() || null } }
//     );

//     res.send({ modifiedCount: updateResult.modifiedCount });
//   } catch (err) {
//     console.error(err);
//     res.status(500).send({ message: "Failed to update request" });
//   }
// });

// PATCH /assets-request/status/:id
app.patch("/assets-request/status/:id", async (req, res) => {
  const { id } = req.params;
  const { status, updatedBy, approvedBy } = req.body;

  try {
    const result = await assetsRequestCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status,
          updatedBy: updatedBy?.trim().toLowerCase() || null,
          approvedBy: approvedBy?.trim().toLowerCase() || null,
        },
      }
    );

    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to update status" });
  }
});


app.get('/assets', async (req, res) => {
  try {
    const result = await assetsCollection.find().toArray();
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to fetch assets" });
  }
});

// ==================== ASSETS REQUEST ====================
// app.get("/assets-request", async (req, res) => {
//   try {
// 	const requestsRaw = await assetsRequestCollection.find().toArray();
//     console.log(requestsRaw.map(r => ({ approvedBy: r.approvedBy })));
//     const requests = await assetsRequestCollection
//       .aggregate([
//         {
//           $lookup: {
//             from: "users",          // users collection থেকে join
//             localField: "approvedBy", // assets-request এর approvedBy (email)
//             foreignField: "email",    // users collection এর email
//             as: "adminInfo",
//           },
//         },
//         {
//           $addFields: {
//             approvedByName: {
//               $cond: [
//                 { $gt: [{ $size: "$adminInfo" }, 0] },
//                 { $arrayElemAt: ["$adminInfo.name", 0] }, // নাম attach করা
//                 "$approvedBy", // যদি কোন admin পাওয়া না যায়, email দেখাবে
//               ],
//             },
//           },
//         },
//         {
//           $project: {
//             adminInfo: 0, // extra field drop
//           },
//         },
//       ])
//       .toArray();

//     res.send(requests);
//   } catch (err) {
//     console.error(err);
//     res.status(500).send({ message: "Failed to fetch asset requests" });
//   }
// });

// ==================== ASSETS REQUEST ====================
// app.get("/assets-request", async (req, res) => {
//   try {
//     // Aggregation to include Approved By Name
//     const requests = await assetsRequestCollection
//       .aggregate([
//         // Lookup user info for request creator (optional)
//         {
//           $lookup: {
//             from: "users",
//             localField: "userEmail", // request করা user
//             foreignField: "email",
//             as: "userInfo",
//           },
//         },
//         // Lookup admin info (who approved)
//         {
//           $lookup: {
//             from: "users",
//             localField: "approvedBy", // approvedBy field
//             foreignField: "email",
//             as: "adminInfo",
//           },
//         },
//         {
//           $addFields: {
//             approvedByName: {
//               $cond: [
//                 { $gt: [{ $size: "$adminInfo" }, 0] },
//                 { $arrayElemAt: ["$adminInfo.name", 0] },
//                 "$approvedBy", // email show হবে যদি name না পাওয়া যায়
//               ],
//             },
//             userInfo: { $arrayElemAt: ["$userInfo", 0] }, // simplify userInfo
//           },
//         },
//         {
//           $project: {
//             adminInfo: 0, // remove extra
//           },
//         },
//       ])
//       .toArray();

//     res.send(requests);
//   } catch (err) {
//     console.error(err);
//     res.status(500).send({ message: "Failed to fetch asset requests" });
//   }
// });

// app.get("/assets-request", async (req, res) => {
//   try {
//     const requests = await assetsRequestCollection
//       .aggregate([
//         // 1️⃣ Request user info attach
//         {
//           $lookup: {
//             from: "users",
//             localField: "userEmail",
//             foreignField: "email",
//             as: "userInfo",
//           },
//         },
//         // simplify userInfo
//         { $addFields: { userInfo: { $arrayElemAt: ["$userInfo", 0] } } },

//         // 2️⃣ Approved by admin info (case-insensitive join)
//         {
//           $lookup: {
//             from: "users",
//             let: { approvedEmail: "$approvedBy" },
//             pipeline: [
//               {
//                 $match: {
//                   $expr: {
//                     $eq: [
//                       { $toLower: "$email" },
//                       { $toLower: "$$approvedEmail" }
//                     ]
//                   }
//                 }
//               }
//             ],
//             as: "adminInfo"
//           }
//         },
//         {
//           $addFields: {
//             approvedByName: {
//               $cond: [
//                 { $gt: [{ $size: "$adminInfo" }, 0] },
//                 { $arrayElemAt: ["$adminInfo.name", 0] },
//                 "$approvedBy" // email দেখাবে যদি name না পাওয়া যায়
//               ]
//             }
//           }
//         },
//         { $project: { adminInfo: 0 } } // extra drop
//       ])
//       .toArray();

//     res.send(requests);
//   } catch (err) {
//     console.error(err);
//     res.status(500).send({ message: "Failed to fetch asset requests" });
//   }
// });
// app.get("/assets-request", async (req, res) => {
//   try {
//     const requests = await assetsRequestCollection
//       .aggregate([
//         // request করা user info attach
//         {
//           $lookup: {
//             from: "users",
//             localField: "userEmail",
//             foreignField: "email",
//             as: "userInfo",
//           },
//         },
//         { $addFields: { userInfo: { $arrayElemAt: ["$userInfo", 0] } } },

//         // approvedBy (admin) info attach, case-insensitive
//         {
//           $lookup: {
//             from: "users",
//             let: { approvedEmail: "$approvedBy" },
//             pipeline: [
//               {
//                 $match: {
//                   $expr: {
//                     $eq: [
//                       { $toLower: "$email" },
//                       { $toLower: "$$approvedEmail" }
//                     ]
//                   }
//                 }
//               }
//             ],
//             as: "adminInfo"
//           }
//         },
//         {
//           $addFields: {
//             approvedByName: {
//               $cond: [
//                 { $gt: [{ $size: "$adminInfo" }, 0] },
//                 { $arrayElemAt: ["$adminInfo.name", 0] },
//                 "$approvedBy"
//               ]
//             }
//           }
//         },
//         { $project: { adminInfo: 0 } } // extra remove
//       ])
//       .toArray();

//     res.send(requests);
//   } catch (err) {
//     console.error(err);
//     res.status(500).send({ message: "Failed to fetch asset requests" });
//   }
// });
// app.get("/assets-request", async (req, res) => {
//   try {
//     const requests = await assetsRequestCollection
//       .aggregate([
//         // Attach user info
//         {
//           $lookup: {
//             from: "users",
//             localField: "userEmail",
//             foreignField: "email",
//             as: "userInfo",
//           },
//         },
//         {
//           $addFields: { userInfo: { $arrayElemAt: ["$userInfo", 0] } },
//         },

//         // Attach approvedByName from users collection (case-insensitive)
//         {
//           $lookup: {
//             from: "users",
//             let: { approvedEmail: "$approvedBy" },
//             pipeline: [
//               {
//                 $match: {
//                   $expr: {
//                     $and: [
//                       { $ne: ["$$approvedEmail", null] }, // approvedBy null ignore
//                       {
//                         $eq: [
//                           { $toLower: "$email" },
//                           { $toLower: "$$approvedEmail" },
//                         ],
//                       },
//                     ],
//                   },
//                 },
//               },
//             ],
//             as: "adminInfo",
//           },
//         },
//         {
//           $addFields: {
//             approvedByName: {
//               $cond: [
//                 { $gt: [{ $size: "$adminInfo" }, 0] },
//                 { $arrayElemAt: ["$adminInfo.name", 0] },
//                 { $ifNull: ["$approvedBy", "N/A"] }, // null হলে N/A
//               ],
//             },
//           },
//         },

//         { $project: { adminInfo: 0 } }, // extra remove
//       ])
//       .toArray();

//     res.send(requests);
//   } catch (err) {
//     console.error(err);
//     res.status(500).send({ message: "Failed to fetch asset requests" });
//   }
// });
// GET /assets-request
// app.get("/assets-request", async (req, res) => {
//   try {
//     const requests = await assetsRequestCollection.aggregate([
//       // Attach user info
//       {
//         $lookup: {
//           from: "users",
//           localField: "userEmail",
//           foreignField: "email",
//           as: "userInfo",
//         },
//       },
//       { $addFields: { userInfo: { $arrayElemAt: ["$userInfo", 0] } } },

//       // Attach approvedByName from users collection (case-insensitive)
//       {
//         $lookup: {
//           from: "users",
//           let: { approvedEmail: { $toLower: "$approvedBy" } },
//           pipeline: [
//             {
//               $match: {
//                 $expr: {
//                   $eq: [{ $toLower: "$email" }, "$$approvedEmail"],
//                 },
//               },
//             },
//           ],
//           as: "adminInfo",
//         },
//       },
//       {
//         $addFields: {
//           approvedByName: {
//             $cond: [
//               { $gt: [{ $size: "$adminInfo" }, 0] },
//               { $arrayElemAt: ["$adminInfo.name", 0] },
//               { $ifNull: ["$approvedBy", "N/A"] },
//             ],
//           },
//         },
//       },

//       { $project: { adminInfo: 0 } },
//     ]).toArray();

//     res.send(requests);
//   } catch (err) {
//     console.error(err);
//     res.status(500).send({ message: "Failed to fetch asset requests" });
//   }
// });

// GET /assets-request
app.get("/assets-request", async (req, res) => {
  try {
    const requests = await assetsRequestCollection.aggregate([
      // Attach user info
      {
        $lookup: {
          from: "users",
          localField: "userEmail",
          foreignField: "email",
          as: "userInfo",
        },
      },
      { $addFields: { userInfo: { $arrayElemAt: ["$userInfo", 0] } } },

      // Attach approvedByName from users collection (case-insensitive)
      {
        $lookup: {
          from: "users",
          let: { approvedEmail: { $toLower: "$approvedBy" } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [{ $toLower: "$email" }, "$$approvedEmail"],
                },
              },
            },
          ],
          as: "adminInfo",
        },
      },
      {
        $addFields: {
          approvedByName: {
            $cond: [
              { $gt: [{ $size: "$adminInfo" }, 0] },
              { $arrayElemAt: ["$adminInfo.name", 0] },
              { $ifNull: ["$approvedBy", "N/A"] },
            ],
          },
        },
      },

      { $project: { adminInfo: 0 } },
    ]).toArray();

    res.send(requests);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to fetch asset requests" });
  }
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
// 10-12-25
// app.post('/purchases', async (req, res) => {
// 	try {
// 		const item = req.body;
// 		item.createdAt = new Date();

// 		// Update asset quantities
// 		if (item.items && Array.isArray(item.items)) {
// 			for (const purchaseItem of item.items) {
// 				if (purchaseItem.productName && purchaseItem.qty) {
// 					await assetsCollection.updateOne(
// 						{ _id: new ObjectId(purchaseItem.productName) },
// 						{ $inc: { quantity: Number(purchaseItem.qty) } }
// 					);
// 				}
// 			}
// 		}

// 		const addedResult = await purchasesCollection.insertOne(item);
// 		res.send({ insertedId: addedResult.insertedId });
// 	} catch (error) {
// 		console.error('Error creating purchase:', error);
// 		res.status(500).send({ error: 'Insertion failed' });
// 	}
// });

// with-assetName

// app.post('/purchases', async (req, res) => {
// 	try {
// 		const item = req.body;
// 		item.createdAt = new Date();

// 		// Update asset quantities + Save asset name
// 		if (item.items && Array.isArray(item.items)) {
// 			for (const purchaseItem of item.items) {
// 				if (purchaseItem.productName && purchaseItem.qty) {

// 					// Find asset info
// 					const asset = await assetsCollection.findOne({
// 						_id: new ObjectId(purchaseItem.productName)
// 					});

// 					// Save readable asset name inside purchase
// 					purchaseItem.assetName = asset?.name || "Unknown";

// 					// Increment quantity
// 					await assetsCollection.updateOne(
// 						{ _id: new ObjectId(purchaseItem.productName) },
// 						{ $inc: { quantity: Number(purchaseItem.qty) } }
// 					);
// 				}
// 			}
// 		}

// 		const addedResult = await purchasesCollection.insertOne(item);
// 		res.send({ insertedId: addedResult.insertedId });
// 	} catch (error) {
// 		console.error('Error creating purchase:', error);
// 		res.status(500).send({ error: 'Insertion failed' });
// 	}
// });

// app.post('/purchases', async (req, res) => {
//         try {
//             const item = req.body;

//             // --- Basic timestamps ---
//             item.createdAt = new Date();
//             item.updatedAt = new Date();

//             // Ensure createdBy exists
//             item.createdBy = item.createdBy || "unknown";
//             item.updatedBy = item.updatedBy || item.createdBy;

//             // ========== Validate Items ==========
//             if (!item.items || !Array.isArray(item.items)) {
//                 return res.status(400).send({ error: "Items array missing" });
//             }

//             // ========== Update Asset Quantities ==========
//             for (const purchaseItem of item.items) {

//                 if (!purchaseItem.productName || !purchaseItem.qty) continue;

//                 const assetId = new ObjectId(purchaseItem.productName);

//                 // Fetch asset info
//                 const asset = await assetsCollection.findOne({ _id: assetId });

//                 // Save readable name
//                 purchaseItem.assetName = asset?.name || "Unknown";

//                 // Update asset qty
//                 await assetsCollection.updateOne(
//                     { _id: assetId },
//                     { $inc: { quantity: Number(purchaseItem.qty) } }
//                 );
//             }

//             // ========== Insert Purchase ==========
//             const addedResult = await purchasesCollection.insertOne(item);

//             res.send({
//                 insertedId: addedResult.insertedId,
//                 message: "Purchase created successfully"
//             });

//         } catch (error) {
//             console.error("Error creating purchase:", error);
//             res.status(500).send({ error: "Insertion failed" });
//         }
//     });

app.post('/purchases', async (req, res) => {
    try {
        const item = req.body;

        // --- Basic timestamps ---
        item.createdAt = new Date();
        item.updatedAt = new Date();

        // Ensure createdBy exists
        item.createdBy = item.createdBy || "unknown";
        item.updatedBy = item.updatedBy || item.createdBy;

        // ========== Validate Items ==========
        if (!item.items || !Array.isArray(item.items)) {
            return res.status(400).send({ error: "Items array missing" });
        }

        // ========== Update Asset Quantities ==========
        for (const purchaseItem of item.items) {
            if (!purchaseItem.productName || !purchaseItem.qty) continue;

            const assetId = new ObjectId(purchaseItem.productName);

            // Fetch asset info
            const asset = await assetsCollection.findOne({ _id: assetId });

            // Save readable name
            purchaseItem.assetName = asset?.name || "Unknown";

            // Update asset qty
            await assetsCollection.updateOne(
                { _id: assetId },
                { $inc: { quantity: Number(purchaseItem.qty) } }
            );
        }

        // ========== Ensure vendor info ==========
        if (item.vendorId) {
            const vendor = await vendorsCollection.findOne({ _id: new ObjectId(item.vendorId) });
            if (vendor) {
                item.vendorPhone = vendor.phone || "-";
                item.vendorAddress = vendor.address || "-";
            }
        }

        // ========== Insert Purchase ==========
        const addedResult = await purchasesCollection.insertOne(item);

        res.send({
            insertedId: addedResult.insertedId,
            message: "Purchase created successfully"
        });

    } catch (error) {
        console.error("Error creating purchase:", error);
        res.status(500).send({ error: "Insertion failed" });
    }
});



// app.post('/purchases', async (req, res) => {
//   try {
//     const item = req.body;

//     // Check if createdBy exists
//     if (!item.createdBy || !item.createdBy._id) {
//       return res.status(400).send({ error: "User info missing" });
//     }

//     item.createdAt = new Date();

//     // Update asset quantities + Save asset name
//     if (item.items && Array.isArray(item.items)) {
//       for (const purchaseItem of item.items) {
//         if (purchaseItem.productName && purchaseItem.qty) {

//           // Find asset info
//           const asset = await assetsCollection.findOne({
//             _id: new ObjectId(purchaseItem.productName)
//           });

//           // Save readable asset name inside purchase
//           purchaseItem.assetName = asset?.name || "Unknown";

//           // Increment quantity
//           await assetsCollection.updateOne(
//             { _id: new ObjectId(purchaseItem.productName) },
//             { $inc: { quantity: Number(purchaseItem.qty) } }
//           );
//         }
//       }
//     }

//     const addedResult = await purchasesCollection.insertOne(item);
//     res.send({ insertedId: addedResult.insertedId });
//   } catch (error) {
//     console.error('Error creating purchase:', error);
//     res.status(500).send({ error: 'Insertion failed' });
//   }
// });



app.get('/purchases', async (req, res) => {
  try {
    const purchases = await purchasesCollection.aggregate([
      {
        $lookup: {
          from: "vendors",
          localField: "vendorId",
          foreignField: "_id",
          as: "vendor"
        }
      },
      {
        $unwind: {
          path: "$vendor",
          preserveNullAndEmptyArrays: true
        }
      }
    ]).toArray();

    res.send(purchases);
  } catch (error) {
    console.error("Error fetching purchases:", error);
    res.status(500).send({ error: "Failed to fetch purchases" });
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
